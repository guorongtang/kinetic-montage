import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fingerprint } from './spec.mjs';

function ff(args, opts = {}) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { out: r.stdout || '', err: r.stderr || '', code: r.status };
}

export function probeVideo(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], {
    encoding: 'utf8'
  });
  const j = JSON.parse(r.stdout);
  const v = j.streams.find(s => s.codec_type === 'video');
  const a = j.streams.find(s => s.codec_type === 'audio');
  const [num, den] = (v.r_frame_rate || '30/1').split('/').map(Number);
  return {
    duration: +parseFloat(j.format.duration).toFixed(3),
    size: +j.format.size,
    bitrate: +j.format.bit_rate,
    width: v.width,
    height: v.height,
    fps: +(num / den).toFixed(3),
    frames: +v.nb_frames || Math.round(parseFloat(j.format.duration) * (num / den)),
    videoCodec: v.codec_name,
    pixFmt: v.pix_fmt,
    videoBitrate: +v.bit_rate || null,
    audioCodec: a?.codec_name || null,
    audioBitrate: a ? +a.bit_rate : null,
    audioChannels: a?.channels || null,
    audioRate: a ? +a.sample_rate : null
  };
}

export function loudness(file) {
  const r = ff(['-hide_banner', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const i = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS/.exec(r.err);
  const p = /True peak:\s*\n\s*Peak:\s*(-?[\d.]+) dBFS/.exec(r.err);
  return { integrated: i ? +i[1] : null, truePeak: p ? +p[1] : null };
}

export function staticRuns(file, fps = 30) {
  const tmp = path.join(os.tmpdir(), `km-ydiff-${process.pid}.txt`);
  ff(['-v', 'error', '-i', file, '-vf',
    `tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${tmp}`,
    '-f', 'null', '-']);
  const text = fs.existsSync(tmp) ? fs.readFileSync(tmp, 'utf8') : '';
  fs.rmSync(tmp, { force: true });
  const vals = [...text.matchAll(/YAVG=([\d.]+)/g)].map(m => +m[1]);
  const runs = [];
  let cur = null;
  vals.forEach((v, i) => {
    if (v < 0.5) {
      if (!cur) cur = { start: i, end: i };
      else cur.end = i;
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
  });
  if (cur) runs.push(cur);
  return {
    frames: vals.length,
    meanDiff: +(vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)).toFixed(2),
    runs: runs
      .filter(r => (r.end - r.start + 1) / fps >= 0.5)
      .map(r => ({ from: +(r.start / fps).toFixed(2), to: +((r.end + 1) / fps).toFixed(2), seconds: +((r.end - r.start + 1) / fps).toFixed(2) }))
  };
}

export function psnr(a, b) {
  const r = ff(['-hide_banner', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-']);
  const m = /average:([\d.]+|inf)/.exec(r.err);
  if (!m) return null;
  return m[1] === 'inf' ? 99 : +parseFloat(m[1]).toFixed(2);
}

export function contactSheet(file, out, { cols = 5, rows = 6, every = 30, offset = 0 } = {}) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  ff(['-y', '-i', file, '-vf', `select='not(mod(n+${offset}\\,${every}))',scale=384:216,tile=${cols}x${rows}`,
    '-frames:v', '1', out]);
  return out;
}

export function compareReference(video, referenceDir, fps = 30, framesDir = null) {
  if (!fs.existsSync(referenceDir)) return null;
  const files = fs.readdirSync(referenceDir).filter(f => f.endsWith('.png')).sort();
  if (!files.length) return null;
  const tmp = path.join(os.tmpdir(), `km-ref-${process.pid}`);
  fs.mkdirSync(tmp, { recursive: true });
  const results = [];
  for (const f of files) {
    const n = parseInt(f, 10);
    if (!Number.isFinite(n)) continue;
    const ref = path.join(referenceDir, f);
    let framePng = framesDir ? path.join(framesDir, `${String(n).padStart(4, '0')}.png`) : null;
    const hasFrames = framePng && fs.existsSync(framePng);
    let videoPng = path.join(tmp, `f${f}`);
    ff(['-y', '-i', video, '-vf', `select=eq(n\\,${n})`, '-fps_mode', 'vfr', '-frames:v', '1', videoPng]);
    results.push({
      frame: n,
      t: +(n / fps).toFixed(2),
      frames: hasFrames ? psnr(framePng, ref) : null,
      video: fs.existsSync(videoPng) ? psnr(videoPng, ref) : null
    });
    fs.rmSync(videoPng, { force: true });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const pick = k => results.map(r => r[k]).filter(v => v != null);
  const stat = a => (a.length ? { mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), min: Math.min(...a) } : null);
  return { frames: results.length, results, fromFrames: stat(pick('frames')), fromVideo: stat(pick('video')) };
}

export function qa(project, film, videoPath) {
  const rules = film.rules || {};
  const probe = probeVideo(videoPath);
  const loud = loudness(videoPath);
  const st = staticRuns(videoPath, film.meta.fps || 30);
  const cols = 5;
  const rows = Math.ceil(Math.ceil(film.meta.duration) / cols);
  const sheet = contactSheet(videoPath, path.join(project, 'out', 'contact-sheet.png'), {
    cols, rows, every: film.meta.fps || 30, offset: Math.round((film.meta.fps || 30) / 2)
  });
  const ref = compareReference(videoPath, path.join(project, 'reference'), film.meta.fps || 30, path.join(project, 'work', 'frames'));
  const fp = fingerprint(film);
  const expected = film.fingerprint || {};

  const endcard = film.shots.find(s => s.type === 'endcard');
  const endStart = endcard ? endcard.t : Infinity;
  const badStatic = st.runs.filter(r => r.to > endStart + 0.01 ? false : r.seconds > (rules.staticMax ?? 1.2));

  const checks = [];
  const add = (name, value, target, ok) => checks.push({ name, value, target, ok });

  add('duration', `${probe.duration}s`, `${film.meta.duration}s`, Math.abs(probe.duration - film.meta.duration) < 0.05);
  add('frames', probe.frames, Math.round(film.meta.duration * film.meta.fps), probe.frames === Math.round(film.meta.duration * film.meta.fps));
  add('resolution', `${probe.width}x${probe.height}`, `${film.meta.width}x${film.meta.height}`, probe.width === film.meta.width && probe.height === film.meta.height);
  add('fps', probe.fps, film.meta.fps, Math.abs(probe.fps - film.meta.fps) < 0.01);
  add('loudness', `${loud.integrated} LUFS`, `${film.audio.loudness?.I ?? -14} ± 1.5`, Math.abs(loud.integrated - (film.audio.loudness?.I ?? -14)) <= 1.5);
  add('true peak', `${loud.truePeak} dBFS`, `<= ${(film.audio.loudness?.TP ?? -1)}`, loud.truePeak <= (film.audio.loudness?.TP ?? -1) + 0.1);
  add('static gaps', badStatic.length, '0', badStatic.length === 0);
  const refStat = ref?.fromFrames || ref?.fromVideo;
  if (refStat) {
    const threshold = ref?.fromFrames ? 45 : 40;
    add('reference PSNR', `mean ${refStat.mean} / min ${refStat.min}`, `>= ${threshold}`, refStat.mean >= threshold);
  }
  if (expected.cutsPer10s && expected.compare) add('cuts / 10s', fp.cutsPer10s, `~${expected.cutsPer10s}`, Math.abs(fp.cutsPer10s - expected.cutsPer10s) / expected.cutsPer10s <= 0.35);
  if (expected.avgShot && expected.compare) add('avg shot', `${fp.avgShot}s`, `~${expected.avgShot}s`, Math.abs(fp.avgShot - expected.avgShot) / expected.avgShot <= 0.35);
  if (expected.endcardRatio && expected.compare) add('endcard ratio', fp.endcardRatio, `~${expected.endcardRatio}`, Math.abs(fp.endcardRatio - expected.endcardRatio) <= 0.12);

  const report = {
    title: film.meta.title || path.basename(project),
    video: videoPath,
    probe, loudness: loud, static: st, fingerprint: fp,
    reference: ref, checks, contactSheet: sheet,
    ok: checks.every(c => c.ok)
  };

  const md = [];
  md.push(`# QA · ${report.title}`);
  md.push('');
  md.push(`- video: \`${path.relative(project, videoPath)}\``);
  md.push(`- generated: ${new Date().toISOString()}`);
  md.push(`- result: **${report.ok ? 'PASS' : 'FAIL'}**`);
  md.push('');
  md.push('| check | actual | target | result |');
  md.push('|---|---|---|---|');
  for (const c of checks) md.push(`| ${c.name} | ${c.value} | ${c.target} | ${c.ok ? '✅' : '❌'} |`);
  md.push('');
  md.push('## fingerprint');
  md.push('');
  md.push('```json');
  md.push(JSON.stringify(fp, null, 2));
  md.push('```');
  if (ref) {
    md.push('');
    md.push('## reference frames');
    md.push('');
    md.push('| frame | t | frames PSNR | video PSNR |');
    md.push('|---|---|---|---|');
    for (const r of ref.results) md.push(`| ${r.frame} | ${r.t}s | ${r.frames ?? '—'} | ${r.video ?? '—'} |`);
  }
  md.push('');
  md.push('## static runs (>= 0.5s)');
  md.push('');
  if (!st.runs.length) md.push('none');
  else {
    md.push('| from | to | seconds |');
    md.push('|---|---|---|');
    for (const r of st.runs) md.push(`| ${r.from}s | ${r.to}s | ${r.seconds}s |`);
  }
  md.push('');
  md.push(`![contact sheet](contact-sheet.png)`);
  md.push('');

  fs.mkdirSync(path.join(project, 'out'), { recursive: true });
  fs.writeFileSync(path.join(project, 'out', 'qa.md'), md.join('\n'));
  return report;
}
