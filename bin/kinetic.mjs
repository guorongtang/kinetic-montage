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
import { validateFit, evaluateFit, copyFitRecord, writeTopicFit } from '../lib/fit.mjs';
import { generateVo, checkVoFit } from '../lib/vo.mjs';
import { remuxVideo } from '../lib/remux.mjs';

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

function printFit(fit, check) {
  const labels = { fit: 'FIT', not_fit: 'NOT FIT', needs_evidence: 'HOLD', not_applicable: 'N/A' };
  const confidence = check.confidence ? ` (${check.confidence})` : '';
  const target = fit.target?.url || fit.target?.ref || fit.target?.name || '';
  console.log(`${labels[check.verdict] || check.verdict}${confidence}  ${target}`);
  if (fit.action?.label) console.log(`  action: ${fit.action.label} (${fit.action.type})`);
  if (Array.isArray(fit.interface?.screens)) {
    const roles = fit.interface.screens.map(s => s.role).join('/');
    console.log(`  screens: ${fit.interface.screens.length}${roles ? ` (${roles})` : ''}`);
  }
  if (check.productionReady != null) console.log(`  productionReady: ${check.productionReady}`);
  for (const r of check.reasons || []) console.log(`  - ${r}`);
  for (const b of check.blockers || []) console.log(`  ✗ ${b}`);
  if (check.nextStep) console.log(`  → ${check.nextStep}`);
}

function fitExitCode(check) {
  const code = { fit: 0, not_applicable: 0, not_fit: 2, needs_evidence: 3 }[check.verdict];
  return code == null ? 4 : code;
}

function readFit(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`fit file not found: ${abs}`);
  return { abs, fit: JSON.parse(fs.readFileSync(abs, 'utf8')) };
}

function fitGate(root, requireFit) {
  const file = path.join(root, 'fit.json');
  if (!fs.existsSync(file)) {
    if (requireFit) {
      console.error('✗ fit.json missing (run `kinetic fit` first)');
      process.exitCode = 2;
      return false;
    }
    return true;
  }

  let fit;
  try {
    fit = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`✗ fit.json invalid: ${e.message}`);
    if (requireFit) process.exitCode = 4;
    return !requireFit;
  }

  const { errors, warnings } = validateFit(fit, root);
  for (const w of warnings) console.error(`⚠ fit: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`✗ fit: ${e}`);
    if (requireFit) {
      process.exitCode = 4;
      return false;
    }
    return true;
  }

  const check = evaluateFit(fit);
  if (check.verdict === 'fit' || check.verdict === 'not_applicable') {
    if (check.verdict === 'fit' && check.productionReady === false) {
      console.error('⚠ fit: productionReady=false（截图偏少，成片需多用字卡）');
    }
    return true;
  }

  printFit(fit, check);
  if (requireFit) {
    process.exitCode = fitExitCode(check);
    return false;
  }
  console.error('⚠ fit 未通过；继续渲染（--require-fit 可强制拦截）');
  return true;
}


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
  kinetic fit <fit.json> [--json]
  kinetic init <dir> [--fit fit.json | --topic "..."] [--title "..." --duration 14 --force --require-fit]
  kinetic check <dir>
  kinetic still <dir> --t 0,3.2 [--out path]
  kinetic sheet <dir>
  kinetic preview <dir> [--port 4173]
  kinetic draft <dir> --words <vo.words.json> [--force]
  kinetic vo <dir> --text <vo.txt> [--speaker chat-girl-105-cn] [--speed 1.3] [--at 0.2] [--tail 0.5] [--fit] [--use] [--force]
  kinetic render <dir> [--from 0 --to 900] [--require-fit]
  kinetic mix <dir>
  kinetic remux <dir> --video <in.mp4> --audio <in.wav> [--out out.mp4]
  kinetic build <dir> [--name slug --no-qa --require-fit]
  kinetic qa <dir> [--video path]
  kinetic eject <dir>
`);
    return;
  }

  if (cmd === 'doctor') return void doctor();

  if (cmd === 'fit') {
    let loaded;
    try {
      loaded = readFit(pos[0] || 'fit.json');
    } catch (e) {
      console.error('✗', e.message);
      process.exitCode = 4;
      return;
    }
    const { fit, abs } = loaded;
    const { errors, warnings } = validateFit(fit, path.dirname(abs));
    for (const w of warnings) console.error(`⚠ ${w}`);
    if (errors.length) {
      for (const e of errors) console.error(`✗ ${e}`);
      process.exitCode = 4;
      return;
    }
    const check = evaluateFit(fit);
    if (flags.json) console.log(JSON.stringify({ target: fit.target, action: fit.action, ...check }, null, 2));
    else printFit(fit, check);
    process.exitCode = fitExitCode(check);
    return;
  }

  if (cmd === 'init') {
    const topic = typeof flags.topic === 'string'
      ? flags.topic
      : flags.topic
        ? (flags.title || path.basename(path.resolve(dir)))
        : null;
    if (flags.fit && topic) throw new Error('use either --fit or --topic, not both');
    if (flags['require-fit'] && !flags.fit && !topic) {
      throw new Error('--require-fit requires --fit <fit.json> or --topic');
    }

    let fit = null;
    if (flags.fit) {
      let loaded;
      try {
        loaded = readFit(flags.fit);
      } catch (e) {
        console.error('✗', e.message);
        process.exitCode = 4;
        return;
      }
      fit = loaded.fit;
      const { errors, warnings } = validateFit(fit, path.dirname(loaded.abs));
      for (const w of warnings) console.error(`⚠ ${w}`);
      if (errors.length) {
        for (const e of errors) console.error(`✗ ${e}`);
        process.exitCode = 4;
        return;
      }
      const check = evaluateFit(fit);
      if (check.verdict !== 'fit') {
        printFit(fit, check);
        process.exitCode = check.verdict === 'not_applicable' ? 2 : fitExitCode(check);
        return;
      }
    }

    const root = scaffold(dir, {
      title: flags.title || fit?.target?.name || topic || undefined,
      duration: +(flags.duration || 14),
      force: !!flags.force
    });
    if (flags.fit) {
      copyFitRecord(flags.fit, root);
      console.log('fit copied → fit.json');
    } else if (topic) {
      writeTopicFit(root, topic);
      console.log('fit not_applicable (topic)');
    } else {
      console.error('⚠ no fit.json; run `kinetic fit` first if this is a website');
    }
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

  if (cmd === 'vo') {
    if (!flags.text) throw new Error('vo requires --text <vo.txt>');
    const meta = await generateVo({
      project: root,
      film,
      textFile: flags.text,
      speakerId: flags.speaker || undefined,
      speakerName: flags['speaker-name'] || undefined,
      speed: flags.speed != null ? +flags.speed : undefined,
      at: flags.at != null ? +flags.at : undefined,
      tail: flags.tail != null ? +flags.tail : undefined,
      mode: flags.mode || undefined,
      language: flags.lang || undefined,
      fit: !!flags.fit,
      use: !!flags.use,
      force: !!flags.force,
      musicGain: flags['music-gain'] != null ? +flags['music-gain'] : undefined
    });
    console.log(
      `vo ${meta.speakerName} ${meta.speed}x ${meta.duration.toFixed(2)}s → assets/${meta.src}`
    );
    console.log(
      `   at ${meta.at.toFixed(2)}s, ends ${meta.endsAt.toFixed(2)}s / ${meta.filmDuration.toFixed(2)}s ` +
      `(tail ${(meta.filmDuration - meta.endsAt).toFixed(2)}s)`
    );
    if (flags.use) console.log('   timeline.audio → build (vo + music), shots untouched');
    return;
  }

  if (cmd === 'check') {
    const fp = fingerprint(film);
    console.log('ok:', film.shots.length, 'shots,', film.meta.duration + 's');
    console.log(JSON.stringify(fp, null, 2));
    const vo = checkVoFit(root, film);
    if (vo) {
      console.log(vo.message);
      if (!vo.ok) process.exitCode = 3;
    }
    const fitFile = path.join(root, 'fit.json');
    if (fs.existsSync(fitFile)) {
      try {
        const fit = JSON.parse(fs.readFileSync(fitFile, 'utf8'));
        const { errors, warnings } = validateFit(fit, root);
        for (const w of warnings) console.log('  ⚠ fit: ' + w);
        if (errors.length) {
          console.log('fit: invalid');
          for (const e of errors) console.log('  ✗ fit: ' + e);
        } else {
          const check = evaluateFit(fit);
          console.log(`fit: ${check.verdict}${check.confidence ? ` (${check.confidence})` : ''}`);
          const endcard = film.shots.find(s => s.type === 'endcard');
          if (fit.action?.label && endcard?.cta && !endcard.cta.includes(fit.action.label) && !fit.action.label.includes(endcard.cta)) {
            console.log(`  ⚠ endcard CTA "${endcard.cta}" 和 fit.action "${fit.action.label}" 不一致`);
          }
        }
      } catch (e) {
        console.log('fit: unreadable (' + e.message + ')');
      }
    }
    return;
  }

  if (cmd === 'render') {
    if (!fitGate(root, !!flags['require-fit'])) return;
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

  if (cmd === 'remux') {
    const video = flags.video && path.resolve(flags.video);
    if (!video) throw new Error('remux requires --video <in.mp4>');
    const audio = flags.audio
      ? path.resolve(flags.audio)
      : path.join(root, 'out', 'master.wav');
    const out = flags.out
      ? path.resolve(flags.out)
      : path.join(root, 'out', `${path.basename(video, '.mp4')}-vo.mp4`);
    const r = remuxVideo({ video, audio, out });
    console.log(
      `remux ${rel(r.out)}  video ${r.after.frames} frames ${r.after.width}x${r.after.height} ` +
      `${r.after.duration.toFixed(2)}s (unchanged), audio ${r.audio.duration.toFixed(2)}s`
    );
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
    if (!fitGate(root, !!flags['require-fit'])) return;
    const vo = checkVoFit(root, film);
    if (vo && !vo.ok) {
      console.error(vo.message);
      console.error('✗ build stopped: VO outlasts the film; cut text or adjust --tail before rendering');
      process.exitCode = 3;
      return;
    }
    if (vo) console.log(vo.message);
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
