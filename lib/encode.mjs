import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function encodeVideo({ project, film, framesDir, audio, outPath }) {
  const e = film.encode || {};
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const copy = audio.copy && /\.(m4a|mp4|mov)$/i.test(audio.file);
  const args = [
    '-y', '-loglevel', 'error',
    '-framerate', String(film.meta.fps || 30),
    '-i', path.join(framesDir, '%04d.png'),
    '-i', audio.file,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264',
    '-preset', e.preset || 'slow',
    '-crf', String(e.crf ?? 22),
    '-pix_fmt', 'yuv420p'
  ];
  if (copy) args.push('-c:a', 'copy', '-shortest');
  else args.push('-c:a', 'aac', '-b:a', e.audioBitrate || '256k', '-t', String(film.meta.duration));
  args.push(outPath);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  return { outPath, audioCopied: copy };
}
