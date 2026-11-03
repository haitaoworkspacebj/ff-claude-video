import fs from 'node:fs';

const PORT = 9222;
const outDir = process.argv[2] ?? 'video/frames';
const start = parseFloat(process.argv[3] ?? '0');
const end = parseFloat(process.argv[4] ?? '1');
const fps = parseFloat(process.argv[5] ?? '30');
const quality = process.argv[6] ?? 'png';
fs.mkdirSync(outDir, { recursive: true });

const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('localhost:5173'));
if (!page) {
  console.error('no page target', targets.map((t) => t.url));
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
};
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1,
  mobile: false,
});

// wait for the app
for (let i = 0; i < 100; i++) {
  const r = await send('Runtime.evaluate', {
    expression: 'window.__cineReady === true',
    returnByValue: true,
  });
  if (r.result.value) break;
  await new Promise((r2) => setTimeout(r2, 100));
}

const frames = Math.round((end - start) * fps);
const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  const t = start + f / fps;
  await send('Runtime.evaluate', {
    expression: `window.__cine.renderAt(${t})`,
    awaitPromise: false,
  });
  const shot = await send('Page.captureScreenshot', { format: quality, fromSurface: true });
  const ext = quality === 'jpeg' ? 'jpg' : 'png';
  const name = `${outDir}/${String(f).padStart(6, '0')}.${ext}`;
  fs.writeFileSync(name, Buffer.from(shot.data, 'base64'));
  if (f % 60 === 0) {
    const dt = (Date.now() - t0) / 1000;
    console.log(`frame ${f}/${frames} t=${t.toFixed(2)} elapsed=${dt.toFixed(1)}s`);
  }
}
console.log(`done ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
ws.close();
