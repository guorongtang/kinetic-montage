#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadProject, fingerprint } from '../lib/spec.mjs';
import { renderFrames, renderStills, createRenderer } from '../lib/render.mjs';
import { mixAudio } from '../lib/audio.mjs';
import { encodeVideo } from '../lib/encode.mjs';
import { qa } from '../lib/qa.mjs';
import { doctor } from '../lib/doctor.mjs';
import { scaffold } from '../lib/scaffold.mjs';
import { draftFromWords } from '../lib/draft.mjs';
import { startPreview } from '../lib/preview.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const { pos, flags } = parse(argv.slice(1));

function parse(args) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[k] = next; i++; }
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

const dir = pos[0] || '.';
const slug = s => String(s || 'film').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5-]+/g, '-').replace(/^-|-$/g, '') || 'film';
const rel = p => path.relative(process.cwd(), p) || '.';

function load(dir) {
  const p = loadProject(dir);
  if (p.warnings.length) {
    console.log('warnings:');
    for (const w of p.warnings) console.log('  ⚠ ' + w);
  }
  if (p.errors.length) {
    console.error('errors:');
    for (const e of p.errors) console.error('  ✗ ' + e);
    process.exit(2);
  }
  return p;
}

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(`kinetic — fast-cut kinetic typography generator

  kinetic doctor
  kinetic init <dir> [--title "..." --duration 14 --force]
  kinetic check <dir>
  kinetic still <dir> --t 0,3.2 [--out path]
  kinetic sheet <dir>
  kinetic preview <dir> [--port 4173]
  kinetic draft <dir> --words <vo.words.json> [--force]
  kinetic render <dir> [--from 0 --to 900]
  kinetic mix <dir>
  kinetic build <dir> [--name slug --no-qa]
  kinetic qa <dir> [--video path]
  kinetic eject <dir>
`);
    return;
  }

  if (cmd === 'doctor') return void doctor();

  if (cmd === 'init') {
    const root = scaffold(dir, {
      title: flags.title,
      duration: +(flags.duration || 14),
      force: !!flags.force
    });
    console.log('created', rel(root));
    return;
  }

  if (cmd === 'preview') {
    const { url, close } = await startPreview(dir, { port: +(flags.port || 4173) });
    console.log('preview', url, '(ctrl-c to stop)');
    process.on('SIGINT', () => { close(); process.exit(0); });
    return;
  }

  const { root, film } = load(dir);

  if (cmd === 'check') {
    const fp = fingerprint(film);
    console.log('ok:', film.shots.length, 'shots,', film.meta.duration + 's');
    console.log(JSON.stringify(fp, null, 2));
    return;
  }

  if (cmd === 'render') {
    const r = await renderFrames(root, film, {
      dest: path.join(root, 'work', 'frames'),
      from: flags.from != null ? +flags.from : 0,
      to: flags.to != null ? +flags.to : undefined,
      engineDir: flags.engine ? path.resolve(flags.engine) : undefined,
      channel: flags.channel
    });
    console.log(`rendered ${r.frames} frames in ${(r.ms / 1000).toFixed(1)}s`);
    if (r.failed.length) console.log('missing assets:', r.failed);
    return;
  }

  if (cmd === 'mix') {
    const a = mixAudio(root, film);
    console.log('audio', rel(a.file), a.copy ? '(copy)' : '(re-encoded)');
    return;
  }

  if (cmd === 'still') {
    const times = String(flags.t || '0').split(',').map(Number).filter(Number.isFinite);
    const engineDir = flags.engine ? path.resolve(flags.engine) : undefined;
    if (flags.out && times.length === 1) {
      const out = path.resolve(flags.out);
      const r = await createRenderer(root, film, { engineDir, channel: flags.channel });
      await r.still(times[0], out);
      await r.close();
      console.log(rel(out));
      return;
    }
    const dest = path.join(root, 'work', 'stills');
    const files = await renderStills(root, film, times, dest, { engineDir, channel: flags.channel });
    for (const f of files) console.log(rel(f));
    return;
  }

  if (cmd === 'sheet') {
    const shots = film.shots;
    const times = shots.map((s, i) => {
      const next = shots[i + 1];
      const len = (next ? next.t : film.meta.duration) - s.t;
      const dt = s.type === 'endcard' ? 1.2 : Math.min(0.25, Math.max(0.12, len * 0.4));
      return +(s.t + dt).toFixed(3);
    });
    const cols = 5;
    const rows = Math.ceil(times.length / cols);
    const tmp = path.join(root, 'work', 'sheet');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const r = await createRenderer(root, film, { engineDir: flags.engine ? path.resolve(flags.engine) : undefined, channel: flags.channel });
    for (let i = 0; i < times.length; i++) {
      await r.still(times[i], path.join(tmp, `${String(i).padStart(2, '0')}.png`));
    }
    await r.close();
    const out = path.join(root, 'out', 'sheet.png');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(tmp, '%02d.png'),
      '-vf', `scale=384:216,tile=${cols}x${rows}`, '-frames:v', '1', out], { stdio: 'inherit' });
    console.log('sheet', rel(out), `${times.length} shots`);
    return;
  }

  if (cmd === 'draft') {
    if (!flags.words) throw new Error('draft requires --words <vo.words.json>');
    const tl = draftFromWords({
      project: root,
      wordsFile: path.resolve(flags.words),
      duration: +(flags.duration || film.meta.duration),
      maxChars: +(flags.chars || 5)
    });
    const out = path.join(root, flags.force ? 'timeline.json' : 'timeline.draft.json');
    fs.writeFileSync(out, JSON.stringify(tl, null, 2) + '\n');
    console.log('draft', rel(out), `${tl.shots.length} shots`);
    return;
  }

  if (cmd === 'build') {
    const name = slug(flags.name || film.meta.title || path.basename(root));
    const framesDir = path.join(root, 'work', 'frames');
    const r = await renderFrames(root, film, {
      dest: framesDir,
      progress: flags.quiet ? false : true,
      engineDir: flags.engine ? path.resolve(flags.engine) : undefined,
      channel: flags.channel
    });
    if (r.failed.length) console.log('⚠ missing assets:', r.failed);
    console.log(`frames ${r.frames} in ${(r.ms / 1000).toFixed(1)}s`);

    const audio = mixAudio(root, film);
    console.log('audio', rel(audio.file), audio.copy ? '(copy)' : '(built)');

    const outPath = path.join(root, 'out', `${name}.mp4`);
    encodeVideo({ project: root, film, framesDir, audio, outPath });
    console.log('video', rel(outPath));

    if (!flags['no-qa']) {
      const report = qa(root, film, outPath);
      console.log(`qa ${report.ok ? 'PASS' : 'FAIL'} → out/qa.md`);
      for (const c of report.checks) console.log(`  ${c.ok ? '✅' : '❌'} ${c.name}: ${c.value} (${c.target})`);
      if (!report.ok) process.exitCode = 3;
    }
    return;
  }

  if (cmd === 'qa') {
    let video = flags.video && path.resolve(flags.video);
    if (!video) {
      const outs = fs.existsSync(path.join(root, 'out'))
        ? fs.readdirSync(path.join(root, 'out')).filter(f => f.endsWith('.mp4'))
        : [];
      if (!outs.length) throw new Error('no mp4 in out/ (pass --video)');
      video = path.join(root, 'out', outs.sort().pop());
    }
    const report = qa(root, film, video);
    console.log(`qa ${report.ok ? 'PASS' : 'FAIL'} → out/qa.md`);
    for (const c of report.checks) console.log(`  ${c.ok ? '✅' : '❌'} ${c.name}: ${c.value} (${c.target})`);
    if (!report.ok) process.exitCode = 3;
    return;
  }

  if (cmd === 'eject') {
    const dst = path.join(root, 'engine');
    fs.rmSync(dst, { recursive: true, force: true });
    fs.cpSync(path.resolve(import.meta.dirname, '..', 'engine'), dst, { recursive: true });
    fs.mkdirSync(path.join(root, 'presets'), { recursive: true });
    fs.copyFileSync(path.resolve(import.meta.dirname, '..', 'presets', 'v13.json'), path.join(root, 'presets', 'v13.json'));
    fs.writeFileSync(path.join(root, 'ENGINE.md'), `# ejected engine

本地改 \`engine/\` 下的渲染代码。\n
渲染时加：\n
\`\`\`bash
kinetic build . --engine .
\`\`\`
`);
    console.log('ejected →', rel(dst));
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch(e => {
  console.error('✗', e.message);
  process.exit(1);
});
