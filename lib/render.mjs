import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ENGINE = path.resolve(import.meta.dirname, '..', 'engine', 'index.html');

export async function createRenderer(project, film, opts = {}) {
  let engine = ENGINE;
  if (opts.engineDir) {
    const dir = path.resolve(opts.engineDir);
    if (fs.existsSync(path.join(dir, 'index.html'))) engine = path.join(dir, 'index.html');
    else if (fs.existsSync(path.join(dir, 'engine', 'index.html'))) engine = path.join(dir, 'engine', 'index.html');
    else throw new Error(`no engine/index.html under ${dir}`);
  }
  const browser = await chromium.launch({ headless: true, channel: opts.channel || undefined });
  const context = await browser.newContext({
    viewport: { width: film.meta.width, height: film.meta.height },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(pathToFileURL(engine).href);
  const assets = pathToFileURL(path.join(project, 'assets')).href + '/';
  const boot = await page.evaluate(({ film, assets }) => window.KM.boot(film, assets), { film, assets });

  return {
    browser,
    page,
    errors,
    boot,
    async still(t, dest) {
      await page.evaluate(x => window.KM.draw(x), t);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await page.screenshot({ path: dest });
    },
    async close() {
      await browser.close();
    }
  };
}

export async function renderFrames(project, film, opts = {}) {
  const fps = film.meta.fps || 30;
  const total = Math.round(film.meta.duration * fps);
  const from = Math.max(0, opts.from ?? 0);
  const to = Math.min(total, opts.to ?? total);
  const dest = opts.dest;
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  const r = await createRenderer(project, film, opts);
  const t0 = Date.now();
  for (let i = from; i < to; i++) {
    await r.page.evaluate(t => window.KM.draw(t), i / fps);
    await r.page.screenshot({ path: path.join(dest, `${String(i).padStart(4, '0')}.png`) });
    if (i % 150 === 0 && opts.progress !== false) console.log(`frame ${i}/${to}`);
  }
  const ms = Date.now() - t0;
  const failed = r.boot?.failed || [];
  await r.close();
  return { frames: to - from, from, to, ms, failed, errors: r.errors };
}

export async function renderStills(project, film, times, dest, opts = {}) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const r = await createRenderer(project, film, opts);
  const out = [];
  for (const t of times) {
    const p = path.join(dest, `${String(t).replace('.', '_')}.png`);
    await r.still(t, p);
    out.push(p);
  }
  await r.close();
  return out;
}
