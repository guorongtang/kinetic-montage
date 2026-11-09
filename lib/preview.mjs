import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { loadProject } from './spec.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4'
};

const player = film => `<!doctype html>
<html><head><meta charset="utf-8"><title>${film.meta.title || 'preview'}</title>
<style>
  html,body{margin:0;background:#111;color:#eee;font:13px/1.4 -apple-system,sans-serif}
  #wrap{display:flex;align-items:center;justify-content:center;height:calc(100vh - 64px)}
  canvas{max-width:100%;max-height:100%;box-shadow:0 12px 40px #0008}
  #bar{height:64px;display:flex;align-items:center;gap:14px;padding:0 20px;background:#1a1a1c}
  #seek{flex:1}
  button{background:#2F5BFF;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-size:14px;cursor:pointer}
  #time{width:70px;text-align:right;font-variant-numeric:tabular-nums}
</style></head><body>
<div id="wrap"><canvas id="c" width="${film.meta.width}" height="${film.meta.height}"></canvas></div>
<div id="bar"><button id="play">▶</button><input id="seek" type="range" min="0" max="${film.meta.duration}" step="0.0333" value="0"><span id="time">0.00</span></div>
<script>
  const FILM = ${JSON.stringify(film)};
  window.__FILM__ = FILM;
  window.__ASSET_BASE__ = '/assets/';
  const DUR = FILM.meta.duration;
  const seek = document.getElementById('seek');
  const time = document.getElementById('time');
  const btn = document.getElementById('play');
  let playing = false, t0 = 0, base = 0, raf = 0;
  function draw(t){ window.KM.draw(Math.min(t, DUR - 0.001)); seek.value = t; time.textContent = t.toFixed(2); }
  window.__PLAYER__ = { ready(){ draw(0); } };
  function loop(now){
    if(!playing) return;
    const t = base + (now - t0) / 1000;
    if(t >= DUR){ draw(DUR - 0.001); playing = false; btn.textContent='▶'; return; }
    draw(t); raf = requestAnimationFrame(loop);
  }
  btn.onclick = () => {
    if(playing){ playing = false; btn.textContent='▶'; cancelAnimationFrame(raf); }
    else { playing = true; base = +seek.value; t0 = performance.now(); btn.textContent='❚❚'; requestAnimationFrame(loop); }
  };
  seek.oninput = () => { playing = false; btn.textContent='▶'; cancelAnimationFrame(raf); draw(+seek.value); };
</script>
<script src="/engine/core.js"></script>
<script src="/engine/cards.js"></script>
<script src="/engine/engine.js"></script>
</body></html>`;

export function startPreview(project, { port = 4173 } = {}) {
  const { film, errors } = loadProject(project);
  if (errors.length) throw new Error(errors.join('\n'));
  const root = path.resolve(project);
  const engineDir = path.resolve(import.meta.dirname, '..', 'engine');

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    try {
      if (p === '/') {
        res.writeHead(200, { 'content-type': MIME['.html'] });
        return res.end(player(film));
      }
      if (p === '/film.json') {
        res.writeHead(200, { 'content-type': MIME['.json'] });
        return res.end(JSON.stringify(film));
      }
      let base;
      if (p.startsWith('/engine/')) base = engineDir;
      else if (p.startsWith('/assets/')) base = path.join(root, 'assets');
      else { res.writeHead(404); return res.end('not found'); }
      const rel = p.replace(/^\/(engine|assets)\//, '');
      const file = path.resolve(base, rel);
      if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e.message));
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${port}/`;
      resolve({ url, server, close: () => server.close() });
    });
  });
}
