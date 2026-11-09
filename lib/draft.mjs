import fs from 'node:fs';
import path from 'node:path';

function flatten(wordsJson) {
  const words = [];
  if (Array.isArray(wordsJson?.sentences)) {
    for (const s of wordsJson.sentences) {
      for (const w of s.words || []) words.push(w);
    }
  } else if (Array.isArray(wordsJson?.words)) {
    words.push(...wordsJson.words);
  } else if (Array.isArray(wordsJson)) {
    words.push(...wordsJson);
  }
  return words
    .map(w => ({
      start: (w.startMs ?? w.start ?? 0) / 1000,
      end: (w.endMs ?? w.end ?? 0) / 1000,
      text: String(w.text ?? '').trim(),
      punct: String(w.punctuation ?? '')
    }))
    .filter(w => w.text);
}

export function draftFromWords({ project, wordsFile, duration = 30, maxChars = 5, voLead = 0.3, maxBeat = 1.1 }) {
  const json = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
  const words = flatten(json);
  if (!words.length) throw new Error('no words found in ' + wordsFile);

  const groups = [];
  let cur = null;
  for (const w of words) {
    if (!cur) cur = { start: w.start, end: w.end, text: w.text, punct: w.punct };
    else {
      const nextLen = [...cur.text].length + [...w.text].length;
      const nextDur = w.end - cur.start;
      if (nextLen > maxChars || nextDur > maxBeat) {
        groups.push(cur);
        cur = { start: w.start, end: w.end, text: w.text, punct: w.punct };
      } else {
        cur.text += w.text;
        cur.end = w.end;
        cur.punct = w.punct;
      }
    }
    if (/[。！？]/.test(w.punct)) {
      groups.push(cur);
      cur = null;
    }
  }
  if (cur) groups.push(cur);

  const palette = ['ink', 'cream', 'red', 'blue', 'cream', 'ink', 'blue', 'red'];
  const shots = [];
  let pi = 0;
  for (const g of groups) {
    const t = Math.max(0, +(g.start - voLead).toFixed(2));
    const prev = shots[shots.length - 1];
    if (prev && t <= prev.t + 0.25) continue;
    const bg = palette[pi++ % palette.length];
    const fg = bg === 'cream' ? 'text' : 'cream';
    const numeric = /^[\d.,]+(k|kb|mb|%|倍|×)?$/i.test(g.text);
    if (numeric) {
      const m = /^([\d.,]+)(.*)$/.exec(g.text);
      shots.push({ t, type: 'number', value: m[1], unit: m[2] || undefined, bg, fg });
    } else {
      shots.push({ t, type: 'word', lines: [g.text], bg, fg, size: 260 });
    }
  }

  const lastShot = shots[shots.length - 1];
  let endT = Math.max(lastShot.t + 1.2, duration - 5.5);
  let total = duration;
  if (total - endT < 4) {
    total = Math.ceil((endT + 4) * 10) / 10;
    endT = +(total - 4).toFixed(2);
  }
  shots.push({
    t: +endT.toFixed(2),
    type: 'endcard',
    bg: 'cream',
    brand: 'YOUR BRAND',
    tagline: '一句话说清价值',
    url: 'example.com',
    cta: '免费 · 打开就能用'
  });

  return {
    meta: {
      title: path.basename(project),
      preset: 'v13',
      width: 1920,
      height: 1080,
      fps: 30,
      duration: total
    },
    audio: { mode: 'build' },
    shots
  };
}
