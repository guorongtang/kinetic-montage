import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { assetPath } from './spec.mjs';

function peakOf(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], {
    encoding: 'utf8'
  });
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(r.stderr || '');
  return m ? parseFloat(m[1]) : 0;
}

export function mixAudio(project, film) {
  const a = film.audio;
  const outDir = path.join(project, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  if (a.mode === 'master') {
    const src = assetPath(project, a.master.src);
    if (!fs.existsSync(src)) throw new Error(`master audio missing: ${src}`);
    return { file: src, copy: a.master.encode === 'copy' };
  }

  const duration = film.meta.duration;
  const items = [];

  if (a.vo?.src) {
    items.push({
      file: assetPath(project, a.vo.src),
      at: a.vo.at ?? 0,
      peak: a.vo.peak ?? -2.5,
      kind: 'vo'
    });
  }
  if (a.music?.src) {
    const m = a.music;
    items.push({
      file: assetPath(project, m.src),
      at: 0,
      gain: m.gain ?? -19,
      kind: 'music',
      srcIn: m.in ?? 0,
      srcLen: m.len ?? duration,
      fadeIn: m.fadeIn ?? 0.4,
      fadeOutAt: m.fadeOutAt ?? duration - 1,
      fadeOut: m.fadeOut ?? 1
    });
  }
  for (const c of a.sfx || []) {
    items.push({
      file: assetPath(project, c.src),
      at: c.at,
      peak: c.peak ?? -12,
      trim: c.trim,
      pitch: c.pitch,
      kind: 'sfx'
    });
  }

  const output = path.join(outDir, 'master.wav');
  if (!items.length) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
      '-t', String(duration), '-ar', '48000', '-ac', '2', output], { stdio: 'inherit' });
    return { file: output, copy: false };
  }

  const inputs = [];
  const filters = [];
  items.forEach((it, i) => {
    if (!fs.existsSync(it.file)) throw new Error(`audio cue missing: ${it.file}`);
    if (it.kind === 'music') inputs.push('-ss', String(it.srcIn), '-t', String(it.srcLen), '-i', it.file);
    else inputs.push('-i', it.file);

    const c = ['aformat=sample_rates=48000:channel_layouts=stereo'];
    if (it.kind === 'music') {
      c.push(`afade=t=in:st=0:d=${it.fadeIn}`);
      c.push(`afade=t=out:st=${it.fadeOutAt}:d=${it.fadeOut}`);
    } else {
      c.push('silenceremove=start_periods=1:start_threshold=-45dB:start_duration=0.01');
      if (it.pitch && it.pitch !== 1) {
        c.push(`asetrate=48000*${it.pitch}`, 'aresample=48000', `atempo=${(1 / it.pitch).toFixed(4)}`);
      }
      if (it.trim) {
        c.push(`atrim=0:${it.trim}`, `afade=t=out:st=${Math.max(0, it.trim - 0.025).toFixed(3)}:d=0.025`);
      }
    }
    if (typeof it.peak === 'number') c.push(`volume=${(it.peak - peakOf(it.file)).toFixed(1)}dB`);
    else c.push(`volume=${it.gain}dB`);
    c.push(`adelay=${Math.round(it.at * 1000)}|${Math.round(it.at * 1000)}`);
    filters.push(`[${i}:a]${c.join(',')}[a${i}]`);
  });

  const L = film.audio.loudness || {};
  const mix = items.map((_, i) => `[a${i}]`).join('');
  const fc = `${filters.join(';')};${mix}amix=inputs=${items.length}:normalize=0:duration=longest,` +
    `loudnorm=I=${L.I ?? -14}:TP=${L.TP ?? -1}:LRA=${L.LRA ?? 11},apad[out]`;

  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', fc,
    '-map', '[out]', '-t', String(duration), '-ar', '48000', '-ac', '2', output], { stdio: 'inherit' });

  return { file: output, copy: false };
}
