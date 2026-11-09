// Dev tool: compare engine output against v13 reference frames
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadProject } from '../lib/spec.mjs';
import { renderStills } from '../lib/render.mjs';

const project = path.resolve('examples/v13-regression');
const { film, errors } = loadProject(project);
if (errors.length) {
  console.error(errors);
  process.exit(1);
}

function psnr(a, b) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], {
    encoding: 'utf8'
  });
  const m = /average:([\d.]+|inf)/.exec(r.stderr || '');
  if (!m) return NaN;
  return m[1] === 'inf' ? 99 : parseFloat(m[1]);
}

const refs = fs.readdirSync(path.join(project, 'reference')).filter(f => f.endsWith('.png')).sort();
const times = refs.map(f => parseInt(f, 10) / film.meta.fps);
const dest = path.join(project, 'work/test');
const files = await renderStills(project, film, times, dest);

const vals = [];
for (let i = 0; i < refs.length; i++) {
  const v = psnr(files[i], path.join(project, 'reference', refs[i]));
  vals.push(v);
  console.log(`frame ${refs[i].replace('.png', '')}  t=${times[i].toFixed(2)}  PSNR ${v}`);
}
const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
const min = Math.min(...vals);
console.log(`mean ${mean.toFixed(2)}  min ${min.toFixed(2)}`);
if (mean < 45) {
  console.error('FAIL: mean PSNR < 45');
  process.exit(1);
}
