// Dev tool: render specific frame indices and md5-compare with the reference project
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadProject } from '../lib/spec.mjs';
import { createRenderer } from '../lib/render.mjs';

const project = path.resolve('examples/v13-regression');
const refDir = path.resolve('../claude_like/films/02-compress2size/work/frames8');
const { film } = loadProject(project);
const frames = process.argv.slice(2).map(Number).filter(Number.isFinite);

const tmp = path.join(project, 'work', 'spot');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const r = await createRenderer(project, film);
const md5 = p => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
let bad = 0;
for (const n of frames) {
  const out = path.join(tmp, `${n}.png`);
  await r.still(n / 30, out);
  const ok = md5(out) === md5(path.join(refDir, `${String(n).padStart(4, '0')}.png`));
  if (!ok) bad++;
  console.log(n, ok ? 'OK' : 'DIFF');
}
await r.close();
console.log(bad ? `${bad} differ` : 'all identical');
