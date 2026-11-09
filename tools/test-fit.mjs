import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFit, validateFit, copyFitRecord } from '../lib/fit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sampleScreen = path.join(root, 'examples', 'v13-regression', 'assets', 'stills', '01-empty.png');
const today = new Date().toISOString().slice(0, 10);

const screen = (role, file = 'fit/01.png') => ({
  role,
  path: file,
  width: 1800,
  height: 1520,
  shows: role
});

function baseFit(overrides = {}) {
  return {
    version: 1,
    target: { type: 'website', name: 'Example', url: 'https://example.com' },
    category: 'saas',
    action: {
      type: 'signup',
      label: '免费开始使用',
      primary: true,
      status: 'verified',
      terminal: '注册后进入工作台',
      strength: 'strong'
    },
    interface: {
      real: true,
      capturable: true,
      authRequired: false,
      screens: [
        screen('entry'),
        screen('content', 'fit/02.png'),
        screen('action', 'fit/03.png'),
        screen('result', 'fit/04.png')
      ]
    },
    evidence: {
      numbers: [
        { value: '9.76 MB', source: '原图' },
        { value: '100 KB', source: '目标' }
      ]
    },
    checkedAt: today,
    ...overrides
  };
}

// --- evaluateFit ---------------------------------------------------------

{
  const check = evaluateFit(baseFit());
  assert.equal(check.verdict, 'fit');
  assert.equal(check.productionReady, true);
  assert.equal(check.confidence, 'high');
}

{
  const check = evaluateFit(baseFit({
    interface: { real: true, capturable: true, screens: [screen('entry')] }
  }));
  assert.equal(check.verdict, 'fit');
  assert.equal(check.productionReady, false);
}

{
  const check = evaluateFit(baseFit({
    interface: { real: true, capturable: true, screens: [] },
    nextStep: '补截图'
  }));
  assert.equal(check.verdict, 'needs_evidence');
  assert.equal(check.nextStep, '补截图');
}

{
  const check = evaluateFit(baseFit({
    interface: { real: true, capturable: true, screens: [] }
  }));
  assert.equal(check.verdict, 'not_fit');
  assert.deepEqual(check.blockers, ['no_capturable_interface']);
}

{
  const check = evaluateFit(baseFit({
    action: { ...baseFit().action, status: 'broken' }
  }));
  assert.equal(check.verdict, 'not_fit');
  assert.deepEqual(check.blockers, ['unreachable_action']);
}

{
  const check = evaluateFit(baseFit({
    action: { ...baseFit().action, status: 'blocked' }
  }));
  assert.equal(check.verdict, 'needs_evidence');
}

{
  const check = evaluateFit(baseFit({ action: undefined }));
  assert.equal(check.verdict, 'not_fit');
  assert.deepEqual(check.blockers, ['no_action']);
}

{
  const check = evaluateFit({ target: { type: 'none', name: 'topic' }, checkedAt: today });
  assert.equal(check.verdict, 'not_applicable');
}

{
  const check = evaluateFit(baseFit({
    action: { ...baseFit().action, type: 'follow', label: '关注我们', strength: undefined }
  }));
  assert.equal(check.verdict, 'fit');
  assert.equal(check.confidence, 'low');
}

// --- validateFit ---------------------------------------------------------

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kinetic-fit-'));
}

const dir = tempDir();
fs.mkdirSync(path.join(dir, 'fit'), { recursive: true });
fs.copyFileSync(sampleScreen, path.join(dir, 'fit', '01.png'));

{
  const fit = baseFit({
    interface: { real: true, capturable: true, screens: [screen('entry')] }
  });
  const v = validateFit(fit, dir);
  assert.deepEqual(v.errors, []);
}

{
  const fit = baseFit({
    interface: { real: true, capturable: true, screens: [screen('entry', 'fit/missing.png')] }
  });
  const v = validateFit(fit, dir);
  assert.ok(v.errors.some(e => e.includes('missing')));
}

{
  const fit = baseFit({
    interface: {
      real: true,
      capturable: true,
      screens: [screen('entry'), screen('entry', 'fit/01.png')]
    }
  });
  const v = validateFit(fit, dir);
  assert.ok(v.errors.some(e => e.includes('duplicate')));
}

{
  const fit = baseFit({
    interface: { real: true, capturable: true, screens: [screen('entry', '/tmp/01.png')] }
  });
  const v = validateFit(fit, dir);
  assert.ok(v.errors.some(e => e.includes('relative')));
}

{
  const fit = baseFit({ checkedAt: '2000-01-01' });
  const v = validateFit(fit, dir);
  assert.ok(v.warnings.some(w => w.includes('days old')));
}

// --- copyFitRecord -------------------------------------------------------

{
  const source = tempDir();
  fs.mkdirSync(path.join(source, 'fit'), { recursive: true });
  fs.copyFileSync(sampleScreen, path.join(source, 'fit', '01.png'));
  const sourceFit = {
    target: { type: 'website', name: 'Copy', url: 'https://example.com' },
    action: baseFit().action,
    interface: { real: true, capturable: true, screens: [screen('entry')] },
    checkedAt: today
  };
  fs.writeFileSync(path.join(source, 'fit.json'), JSON.stringify(sourceFit, null, 2));
  const dest = tempDir();
  copyFitRecord(path.join(source, 'fit.json'), dest);
  assert.ok(fs.existsSync(path.join(dest, 'fit.json')));
  assert.ok(fs.existsSync(path.join(dest, 'fit', '01.png')));
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('fit tests ok');
