import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assetPath } from './spec.mjs';

export const DEFAULT_SPEAKER_ID = 'chat-girl-105-cn';
export const DEFAULT_SPEAKER_NAME = '晓曼';
export const DEFAULT_SPEED = 1.3;
export const DEFAULT_AT = 0.2;
export const DEFAULT_TAIL = 0.5;

const LISTENHUB = process.env.LISTENHUB_BIN || 'listenhub';

function normalizeText(text) {
  return String(text ?? '').replace(/[\s\u3000]+/g, '');
}

export function countVoChars(text) {
  const han = (String(text).match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (String(text).match(/[A-Za-z0-9]+(?:[.@/][A-Za-z0-9]+)*/g) || []).length;
  return han + latin * 1.5;
}

export function fitVoDuration({ duration, at, filmDuration, tail }) {
  const endsAt = +(at + duration).toFixed(3);
  const limit = +(filmDuration - tail).toFixed(3);
  const overrun = +Math.max(0, endsAt - limit).toFixed(3);
  return { ok: overrun === 0, endsAt, limit, overrun };
}

export function estimateCharsToCut({ overrun, duration, charCount }) {
  if (overrun <= 0) return 0;
  const charsPerSecond = charCount / Math.max(0.001, duration);
  return Math.ceil(overrun * charsPerSecond);
}

export function validateTtsCreation(creation, { text, speakerId, speed }) {
  const segments = creation?.topicDetail?.scripts?.data;
  if (!Array.isArray(segments) || !segments.length) {
    throw new Error('TTS response missing topicDetail.scripts.data');
  }
  const joined = segments.map(s => s.content ?? '').join('');
  if (normalizeText(joined) !== normalizeText(text)) {
    throw new Error(
      `TTS text mismatch\n  sent: ${JSON.stringify(text.slice(0, 120))}\n  got:  ${JSON.stringify(joined.slice(0, 120))}`
    );
  }
  const wrongSpeaker = segments.find(s => s.speakerInnerId !== speakerId);
  if (wrongSpeaker) {
    throw new Error(`TTS speaker mismatch: expected ${speakerId}, got ${wrongSpeaker.speakerInnerId}`);
  }
  if (speed != null && Math.abs(Number(creation.speed) - speed) > 0.001) {
    throw new Error(`TTS speed mismatch: expected ${speed}, got ${creation.speed}`);
  }
  const audioUrl = creation?.topicDetail?.audio?.data?.audioUrl;
  if (!audioUrl) throw new Error('TTS response missing topicDetail.audio.data.audioUrl');
  return { segments, audioUrl };
}

export function splitSentences(text) {
  return String(text)
    .match(/[^。！？!?]+[。！？!?]?/g)
    ?.map(s => s.trim())
    .filter(Boolean) ?? [];
}

const CTA_RE = /(colaos|下载|免费|会员|积分|macOS|Windows)/i;

export function trimForFit(text, { protectCta = true } = {}) {
  const sentences = splitSentences(text);
  if (sentences.length <= 2) return null;
  let index = sentences.length - 1;
  if (protectCta && CTA_RE.test(sentences[index]) && sentences.length >= 3) {
    index = sentences.length - 2;
  }
  const [removed] = sentences.splice(index, 1);
  return { text: sentences.join(''), removed };
}

function probeDuration(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' }
  ).trim();
  const duration = Number(out);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`cannot read duration: ${file}`);
  return duration;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function createTts({ text, speakerId, speed, mode, language }) {
  const args = [
    'tts', 'create',
    '--text', text,
    '--speaker-id', speakerId,
    '--speed', String(speed),
    '--mode', mode,
    '--lang', language,
    '--json'
  ];
  let stdout;
  try {
    stdout = execFileSync(LISTENHUB, args, {
      encoding: 'utf8',
      timeout: 330000,
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`listenhub CLI not found (${LISTENHUB}); install it or set LISTENHUB_BIN`);
    }
    const detail = (error.stderr || error.stdout || error.message || '').toString().trim();
    throw new Error(`listenhub tts create failed${detail ? `\n${detail}` : ''}`);
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`listenhub tts create returned non-JSON output\n${stdout.slice(0, 500)}`);
  }
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio download failed: ${res.status} ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

function readText(textFile, project) {
  let abs = path.resolve(textFile);
  if (!fs.existsSync(abs) && !path.isAbsolute(textFile)) {
    const inProject = path.join(project, textFile);
    if (fs.existsSync(inProject)) abs = inProject;
  }
  if (!fs.existsSync(abs)) throw new Error(`vo text not found: ${abs}`);
  const text = fs.readFileSync(abs, 'utf8').trim();
  if (!text) throw new Error(`vo text is empty: ${abs}`);
  return { abs, text };
}

export function loadVoMeta(project) {
  const file = path.join(project, 'assets', 'audio', 'vo.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function checkVoFit(project, film) {
  const a = film.audio || {};
  const meta = loadVoMeta(project);

  // A pre-mixed master is the actual audio; a generated vo.json on disk is not
  // evidence that it was mixed in. Only gate on the VO when the timeline uses it.
  if (a.mode !== 'build' || !a.vo?.src) {
    if (!meta) return null;
    const label = `${meta.speakerName || meta.speakerId || 'vo'} ${meta.speed ? `${meta.speed}x ` : ''}${Number(meta.duration).toFixed(2)}s`;
    return {
      ok: true,
      message: `vo: ${label} on disk, but audio.mode=${a.mode}; not mixed (run with --use to switch to build)`
    };
  }

  const at = meta?.at ?? a.vo.at ?? DEFAULT_AT;
  let duration = meta?.duration;
  if (duration == null) {
    const file = assetPath(project, a.vo.src);
    if (!fs.existsSync(file)) {
      return { ok: false, message: `✗ vo: missing assets/${a.vo.src}` };
    }
    duration = probeDuration(file);
  }
  if (duration == null) {
    return null;
  }

  const tail = meta?.tail ?? DEFAULT_TAIL;
  const fit = fitVoDuration({ duration, at, filmDuration: film.meta.duration, tail });
  const speaker = meta?.speakerName || meta?.speakerId || 'vo';
  const speed = meta?.speed != null ? `${meta.speed}x` : '';
  const head = `vo: ${speaker}${speed ? ` ${speed}` : ''} ${duration.toFixed(2)}s at ${at.toFixed(2)}s`;
  const tailNote = fit.ok
    ? `→ ends ${fit.endsAt.toFixed(2)}s / ${film.meta.duration.toFixed(2)}s (tail ${(film.meta.duration - fit.endsAt).toFixed(2)}s)`
    : `→ ends ${fit.endsAt.toFixed(2)}s / ${film.meta.duration.toFixed(2)}s`;

  if (fit.ok) {
    return { ok: true, message: `✅ ${head} ${tailNote}` };
  }

  const charCount = meta?.charCount ?? 0;
  const chars = charCount > 0
    ? `, cut ~${estimateCharsToCut({ overrun: fit.overrun, duration, charCount })} 字`
    : '';
  return {
    ok: false,
    message: `✗ ${head} ${tailNote} — over by ${fit.overrun.toFixed(2)}s${chars}`
  };
}

export async function generateVo({
  project,
  film,
  textFile,
  speakerId = DEFAULT_SPEAKER_ID,
  speakerName = DEFAULT_SPEAKER_NAME,
  speed = DEFAULT_SPEED,
  at = DEFAULT_AT,
  tail = DEFAULT_TAIL,
  mode = 'direct',
  language = 'zh',
  fit = false,
  use = false,
  force = false,
  musicGain
}) {
  const { text: sourceText, abs: textAbs } = readText(textFile, project);
  const audioRel = 'audio/vo.mp3';
  const audioAbs = assetPath(project, audioRel);
  const tmpAbs = path.join(path.dirname(audioAbs), '.vo.tmp.mp3');
  const metaAbs = path.join(project, 'assets', 'audio', 'vo.json');

  if (fs.existsSync(audioAbs) && !force) {
    throw new Error(`assets/${audioRel} exists; pass --force to overwrite`);
  }

  let text = sourceText;
  let creation;
  let audioUrl;
  let duration;
  let attempts = 0;

  for (;;) {
    attempts++;
    creation = createTts({ text, speakerId, speed, mode, language });
    ({ audioUrl } = validateTtsCreation(creation, { text, speakerId, speed }));
    fs.mkdirSync(path.dirname(audioAbs), { recursive: true });
    await download(audioUrl, tmpAbs);
    duration = probeDuration(tmpAbs);

    const check = fitVoDuration({ duration, at, filmDuration: film.meta.duration, tail });
    if (check.ok) {
      fs.rmSync(audioAbs, { force: true });
      fs.renameSync(tmpAbs, audioAbs);
      break;
    }

    const charCount = countVoChars(text);
    const chars = estimateCharsToCut({ overrun: check.overrun, duration, charCount });
    if (!fit) {
      fs.rmSync(tmpAbs, { force: true });
      throw new Error(
        `VO does not fit: ${duration.toFixed(2)}s at ${at.toFixed(2)}s ends ${check.endsAt.toFixed(2)}s; ` +
        `limit ${check.limit.toFixed(2)}s (${film.meta.duration}s - ${tail}s tail). ` +
        `Over by ${check.overrun.toFixed(2)}s${chars ? ` (~${chars} 字)` : ''}. ` +
        `Cut text, lower --tail, or pass --fit to trim trailing sentences.`
      );
    }
    if (attempts >= 3) {
      fs.rmSync(tmpAbs, { force: true });
      throw new Error(
        `VO still does not fit after ${attempts} attempts (${duration.toFixed(2)}s, over by ${check.overrun.toFixed(2)}s). Cut text manually.`
      );
    }
    const trimmed = trimForFit(text);
    if (!trimmed) {
      fs.rmSync(tmpAbs, { force: true });
      throw new Error(`VO still does not fit and no sentence can be trimmed safely (${duration.toFixed(2)}s).`);
    }
    console.log(`vo: over by ${check.overrun.toFixed(2)}s, trimming → ${trimmed.removed}`);
    text = trimmed.text;
  }

  const meta = {
    src: audioRel,
    textFile: path.relative(project, textAbs),
    text,
    charCount: countVoChars(text),
    speakerId,
    speakerName,
    speed,
    mode,
    language,
    duration: +duration.toFixed(3),
    at,
    endsAt: +(at + duration).toFixed(3),
    filmDuration: film.meta.duration,
    tail,
    creationId: creation.id,
    audioUrl,
    sha256: sha256(audioAbs),
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(metaAbs, JSON.stringify(meta, null, 2) + '\n');

  if (use) {
    useVoInTimeline({ project, film, at, musicGain });
  }

  return meta;
}

export function useVoInTimeline({ project, film, at = DEFAULT_AT, musicGain }) {
  const timelinePath = path.join(project, 'timeline.json');
  const raw = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  const current = raw.audio || {};
  const presetMusic = film.audio?.music || {};
  const music = current.music || {
    src: 'audio/music.m4a',
    in: 0,
    len: film.meta.duration,
    gain: musicGain ?? presetMusic.gain ?? -19,
    fadeIn: presetMusic.fadeIn ?? 0.4,
    fadeOutAt: +(film.meta.duration - 1.4).toFixed(2),
    fadeOut: presetMusic.fadeOut ?? 1.2
  };
  if (musicGain != null) music.gain = musicGain;
  raw.audio = {
    mode: 'build',
    vo: { src: 'audio/vo.mp3', at, peak: -2.5 },
    music,
    loudness: current.loudness || { I: -14, TP: -1, LRA: 11 }
  };
  if (musicGain == null) {
    console.warn(
      `vo: --use is using music gain ${music.gain} dB; pass --music-gain <dB> to match the existing master`
    );
  }
  fs.writeFileSync(timelinePath, JSON.stringify(raw, null, 2) + '\n');
  return raw.audio;
}
