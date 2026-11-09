import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

export function doctor() {
  const rows = [];
  const add = (name, ok, detail) => rows.push({ name, ok, detail });

  const major = +process.versions.node.split('.')[0];
  add('node', major >= 20, process.version);

  try {
    const v = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0];
    add('ffmpeg', true, v.replace('ffmpeg version ', ''));
  } catch {
    add('ffmpeg', false, 'not found — install: brew install ffmpeg');
  }

  try {
    const p = chromium.executablePath();
    add('chromium', fs.existsSync(p), p);
  } catch (e) {
    add('chromium', false, 'run: npx playwright install chromium');
  }

  const preset = path.resolve(import.meta.dirname, '..', 'presets', 'v13.json');
  add('preset v13', fs.existsSync(preset), preset);

  const macFonts = [
    '/System/Library/Fonts/Avenir Next Condensed.ttc',
    '/System/Library/PrivateFrameworks/FontServices.framework/Resources/Reserved/PingFangUI.ttc'
  ];
  const hasMac = macFonts.every(f => fs.existsSync(f));
  add('system fonts', hasMac, hasMac ? 'Avenir Next Condensed + PingFang' : 'missing — bundled fonts will be used');

  const bundled = [
    path.resolve(import.meta.dirname, '..', 'engine', 'fonts', 'ArchivoNarrow-Variable.ttf'),
    path.resolve(import.meta.dirname, '..', 'engine', 'fonts', 'NotoSansSC-Variable.ttf')
  ];
  add('bundled fonts', bundled.every(f => fs.existsSync(f)), 'Archivo Narrow + Noto Sans SC');

  const ok = rows.every(r => r.ok);
  const pad = Math.max(...rows.map(r => r.name.length));
  for (const r of rows) console.log(`${r.ok ? '✅' : '❌'} ${r.name.padEnd(pad)}  ${r.detail}`);
  console.log(ok ? '\nready' : '\nnot ready');
  return { ok, rows };
}
