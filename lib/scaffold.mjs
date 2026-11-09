import fs from 'node:fs';
import path from 'node:path';

const TPL = path.resolve(import.meta.dirname, '..', 'templates', 'project');

export function scaffold(dir, { title, duration = 14, force = false } = {}) {
  const root = path.resolve(dir);
  if (fs.existsSync(path.join(root, 'timeline.json')) && !force) {
    throw new Error(`${root}/timeline.json exists (use --force)`);
  }
  if (duration < 6) throw new Error('duration must be >= 6s');

  for (const d of ['assets/stills', 'assets/fixtures', 'assets/audio', 'assets/sfx', 'work', 'out']) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }

  const name = title || path.basename(root);
  const slug = path.basename(root);
  const fill = s => s
    .replaceAll('{{title}}', name)
    .replaceAll('{{duration}}', String(duration))
    .replaceAll('{{slug}}', slug);

  for (const f of ['film.md', 'script.md', 'README.md']) {
    fs.writeFileSync(path.join(root, f), fill(fs.readFileSync(path.join(TPL, f), 'utf8')));
  }

  const tl = JSON.parse(fs.readFileSync(path.join(TPL, 'timeline.json'), 'utf8'));
  const endLen = Math.min(5.4, Math.max(4, duration * 0.26));
  const contentEnd = 10;
  const scale = (duration - endLen) / contentEnd;
  for (const s of tl.shots) {
    if (s.type === 'endcard') s.t = +(duration - endLen).toFixed(2);
    else s.t = +(s.t * scale).toFixed(2);
  }
  tl.meta.title = name;
  tl.meta.duration = duration;
  if (tl.audio?.music) {
    tl.audio.music.len = Math.min(duration, 30);
    tl.audio.music.fadeOutAt = +(duration - 1.2).toFixed(2);
  }
  fs.writeFileSync(path.join(root, 'timeline.json'), JSON.stringify(tl, null, 2) + '\n');

  const music = path.join(TPL, 'assets', 'audio', 'music.m4a');
  if (fs.existsSync(music)) fs.copyFileSync(music, path.join(root, 'assets', 'audio', 'music.m4a'));

  fs.writeFileSync(path.join(root, '.gitignore'), 'work/\nout/*.mp4\n');
  return root;
}
