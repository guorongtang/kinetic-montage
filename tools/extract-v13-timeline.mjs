// Dev tool: extract the v13 shot list from the original compose8/app.js
// Usage: node tools/extract-v13-timeline.mjs --from /path/to/compose8/app.js --out examples/v13-regression/timeline.json
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const get = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const src = get('--from');
const out = get('--out');
if (!src || !out) {
  console.error('usage: node tools/extract-v13-timeline.mjs --from <compose8/app.js> --out <timeline.json>');
  process.exit(1);
}

const code = fs.readFileSync(src, 'utf8');
const start = code.indexOf('const S0 = [');
const end = code.indexOf('];', start);
if (start < 0 || end < 0) throw new Error('S0 array not found');
const literal = code.slice(start + 'const S0 = '.length, end + 1);
const BLACK = '#0B0B0D', CREAM = '#F3F0E8', BLUE = '#2F5BFF', RED = '#FF3B1F', INK = '#14161A';
const S0 = eval(literal); // plain object literals only

const COLOR = {
  '#0B0B0D': 'ink',
  '#F3F0E8': 'cream',
  '#2F5BFF': 'blue',
  '#FF3B1F': 'red',
  '#14161A': 'text'
};
const tok = c => COLOR[c] || c;

const shots = [];
for (const s of S0) {
  if (s.k === 'end') continue;
  if (s.k === 'num') {
    shots.push({
      t: s.t,
      type: 'number',
      value: s.v,
      unit: s.u || undefined,
      bg: tok(s.bg),
      fg: tok(s.fg),
      kicker: s.kick || undefined
    });
  } else if (s.k === 'word') {
    shots.push({
      t: s.t,
      type: 'word',
      lines: s.a,
      bg: tok(s.bg),
      fg: tok(s.fg),
      size: s.size,
      stamp: s.stamp || undefined
    });
  } else if (s.k === 'img') {
    shots.push({
      t: s.t,
      type: 'image',
      src: s.src,
      mode: s.shot ? 'shot' : 'cover',
      bg: tok(s.bg),
      caption: s.cap || undefined
    });
  } else if (s.k === 'logo') {
    shots.push({
      t: s.t,
      type: 'endcard',
      bg: tok(s.bg),
      brand: 'compress2size',
      tagline: '压到你要的那个数',
      url: 'compress2size.com',
      cta: '免费 · 打开就能用'
    });
  }
}

const timeline = {
  meta: {
    title: 'compress2size · v13 regression',
    preset: 'v13',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 30
  },
  audio: {
    mode: 'master',
    master: { src: 'audio/master.m4a', encode: 'copy' }
  },
  fingerprint: { compare: true },
  motion: { numberExit: 'legacy', imageMotion: 'legacy' },
  shots
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(timeline, null, 2) + '\n');
console.log(`wrote ${out}: ${shots.length} shots`);
