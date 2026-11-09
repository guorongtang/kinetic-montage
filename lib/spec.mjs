import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const PRESET_DIR = path.resolve(import.meta.dirname, '..', 'presets');
export const TYPES = new Set(['number', 'word', 'image', 'endcard']);

export function loadPreset(name = 'v13') {
  const p = path.join(PRESET_DIR, `${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`preset not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = isObj(v) && isObj(a?.[k]) ? merge(a[k], v) : v;
  }
  return out;
}

export function assetPath(project, rel) {
  return path.join(project, 'assets', rel);
}

export function loadProject(dir) {
  const root = path.resolve(dir);
  const file = path.join(root, 'timeline.json');
  if (!fs.existsSync(file)) throw new Error(`timeline.json not found in ${root}`);
  const timeline = JSON.parse(fs.readFileSync(file, 'utf8'));
  const preset = loadPreset(timeline.meta?.preset || 'v13');

  const film = {
    meta: { fps: 30, width: 1920, height: 1080, duration: 30, ...timeline.meta },
    theme: merge(preset.theme, timeline.theme),
    motion: merge(preset.motion, timeline.motion),
    post: merge(preset.post, timeline.post),
    encode: merge(preset.encode, timeline.encode),
    audio: merge(preset.audio, timeline.audio),
    rules: merge(preset.rules, timeline.rules),
    fingerprint: merge(preset.fingerprint, timeline.fingerprint),
    shots: timeline.shots || []
  };

  const errors = [];
  const warnings = [];
  validate(film, root, errors, warnings);
  return { root, timeline, preset, film, errors, warnings };
}

function validate(film, root, errors, warnings) {
  const shots = film.shots;
  if (!Array.isArray(shots) || shots.length === 0) {
    errors.push('shots: empty');
    return;
  }
  if (film.meta.fps !== 30) warnings.push(`meta.fps=${film.meta.fps}; engine currently assumes 30`);
  if (film.meta.duration <= 0) errors.push('meta.duration must be > 0');

  let prev = -1;
  shots.forEach((s, i) => {
    const at = `shots[${i}]`;
    if (typeof s.t !== 'number' || !Number.isFinite(s.t)) errors.push(`${at}.t: not a number`);
    if (s.t < prev) errors.push(`${at}.t: not ascending (${s.t} after ${prev})`);
    prev = s.t;
    if (!TYPES.has(s.type)) errors.push(`${at}.type: unknown "${s.type}"`);
    if (!s.bg) warnings.push(`${at}.bg missing (defaults to ink)`);

    if (s.type === 'number') {
      if (!s.value) errors.push(`${at}.value: required`);
      if (typeof s.value === 'string' && s.value.length > 6) warnings.push(`${at}.value too long: ${s.value}`);
    }
    if (s.type === 'word') {
      if (!Array.isArray(s.lines) || !s.lines.length) errors.push(`${at}.lines: required`);
      else {
        if (s.lines.length > film.rules.maxLines) warnings.push(`${at}.lines=${s.lines.length} > ${film.rules.maxLines}`);
        s.lines.forEach(l => {
          if ([...l].length > film.rules.maxLineChars)
            warnings.push(`${at}.lines too long (${[...l].length} chars): ${l}`);
        });
      }
    }
    if (s.type === 'image') {
      if (!s.src) errors.push(`${at}.src: required`);
      else if (!fs.existsSync(assetPath(root, s.src))) errors.push(`${at}.src missing: assets/${s.src}`);
      else {
        try {
          const dim = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', assetPath(root, s.src)],
          { encoding: 'utf8' }).trim();
          const [w, h] = dim.split('x').map(Number);
          if (w && w < 1600) warnings.push(`${at}.src ${w}x${h} < 1600px wide (will upscale)`);
        } catch { /* ffprobe optional here */ }
      }
    }
    if (s.type === 'endcard') {
      for (const k of ['brand', 'tagline', 'url', 'cta']) if (!s[k]) errors.push(`${at}.${k}: required`);
    }

    const next = shots[i + 1];
    if (next) {
      const d = next.t - s.t;
      if (d < film.rules.minShot) warnings.push(`${at} (${s.type}) ${d.toFixed(2)}s < minShot ${film.rules.minShot}`);
      if (s.type !== 'endcard' && d > film.rules.maxShot)
        warnings.push(`${at} (${s.type}) ${d.toFixed(2)}s > maxShot ${film.rules.maxShot}`);
    }
  });

  if (shots[0].t > 0.001) warnings.push(`first shot starts at ${shots[0].t}, not 0`);

  const last = shots[shots.length - 1];
  const endLen = film.meta.duration - last.t;
  if (last.type === 'endcard') {
    if (endLen < film.rules.endcardMin || endLen > film.rules.endcardMax)
      warnings.push(`endcard ${endLen.toFixed(2)}s outside ${film.rules.endcardMin}-${film.rules.endcardMax}s`);
  }

  const a = film.audio;
  if (a.mode === 'master') {
    if (!a.master?.src) errors.push('audio.master.src: required when mode=master');
    else if (!fs.existsSync(assetPath(root, a.master.src))) errors.push(`audio.master missing: assets/${a.master.src}`);
  } else if (a.mode === 'build') {
    if (a.vo?.src && !fs.existsSync(assetPath(root, a.vo.src))) errors.push(`audio.vo missing: assets/${a.vo.src}`);
    if (a.music?.src && !fs.existsSync(assetPath(root, a.music.src))) errors.push(`audio.music missing: assets/${a.music.src}`);
    for (const [i, c] of (a.sfx || []).entries()) {
      if (!fs.existsSync(assetPath(root, c.src))) errors.push(`audio.sfx[${i}] missing: assets/${c.src}`);
    }
  } else {
    errors.push(`audio.mode: "${a.mode}" (expected master|build)`);
  }

  if (shots.length < (film.rules.minShots || Math.max(4, Math.round(film.meta.duration * 0.4))))
    warnings.push(`only ${shots.length} shots for ${film.meta.duration}s`);
}

export function fingerprint(film) {
  const shots = film.shots;
  const types = { number: 0, word: 0, image: 0, endcard: 0 };
  shots.forEach(s => types[s.type]++);
  const content = shots.filter(s => s.type !== 'endcard');
  const cuts = Math.max(0, content.length - 1);
  const span = content.length ? (content[content.length - 1].t - content[0].t) || 1 : 1;
  const endcard = shots.find(s => s.type === 'endcard');
  return {
    shots: shots.length,
    cuts,
    cutsPer10s: +(cuts / (span / 10)).toFixed(1),
    avgShot: +(span / Math.max(1, content.length - 1)).toFixed(2),
    endcardRatio: endcard ? +((film.meta.duration - endcard.t) / film.meta.duration).toFixed(2) : 0,
    typeMix: types
  };
}
