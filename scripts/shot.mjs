// Screenshot a page with headless Chrome over the DevTools protocol (used by scripts/screenshot.sh).
// Plain `chrome --screenshot` hangs on this Mac and can't go narrower than ~500 px; this drives Chrome directly, with real
// device emulation, and exits when done.
//
// Usage: node scripts/shot.mjs <url> <out.png> [--size 1600x1050] [--mobile] [--wait 4000] [--scheme light|dark]
//                              [--eval "<js run before the shot>"]
// Prints the output path, then the --eval result and any page errors.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const opts = { size: '1600x1050', wait: '4000', scheme: '', eval: '', mobile: false };
const positional = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--mobile') opts.mobile = true;
  else if (a.startsWith('--') && a.slice(2) in opts) opts[a.slice(2)] = argv[++i] ?? '';
  else positional.push(a);
}
const [url, out] = positional;
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [--size WxH] [--mobile] [--wait ms] [--scheme light|dark] [--eval js]');
  process.exit(2);
}
const [w, h] = opts.size.split('x').map(Number);
const { mobile, scheme } = opts;
const wait = Number(opts.wait);
const js = opts.eval;

const CHROMES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
const chromePath = process.env.CHROME_PATH ?? CHROMES.find((c) => existsSync(c));
if (!chromePath) {
  console.error('no Chrome/Chromium found (set CHROME_PATH)');
  process.exit(1);
}

const port = 9300 + Math.floor(Math.random() * 500);
const profile = resolve('build/chrome-shot');
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let targets;
  for (let i = 0; i < 75 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); }
  }
  if (!targets) throw new Error('Chrome did not start');
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0;
  const pending = new Map();
  const notes = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') notes.push(`page exception: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') notes.push(`console error: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  });
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  if (scheme) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url });
  await sleep(wait);
  if (js) {
    const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
    notes.unshift(r.result?.exceptionDetails ? `eval error: ${r.result.exceptionDetails.exception?.description}` : `eval: ${JSON.stringify(r.result?.result?.value)}`);
    await sleep(900);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(out);
  for (const n of notes) console.log(n);
  ws.close();
} finally {
  chrome.kill();
}
