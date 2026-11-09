import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const TARGET_TYPES = new Set(['website', 'app', 'miniprogram', 'plugin', 'none']);

export const ACTION_TYPES = new Set([
  'signup', 'start', 'purchase', 'book', 'download', 'apply',
  'subscribe', 'contact', 'waitlist', 'demo', 'donate',
  'follow', 'share', 'other'
]);

export const ACTION_STRENGTH = {
  signup: 'strong',
  start: 'strong',
  purchase: 'strong',
  book: 'strong',
  download: 'strong',
  apply: 'strong',
  demo: 'strong',
  subscribe: 'medium',
  contact: 'medium',
  waitlist: 'medium',
  donate: 'medium',
  other: 'medium',
  follow: 'weak',
  share: 'weak'
};

export const SCREEN_ROLES = new Set(['entry', 'content', 'action', 'result', 'detail', 'other']);

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const today = () => new Date().toISOString().slice(0, 10);

function parseDate(value) {
  if (typeof value !== 'string') return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function result(verdict, extra = {}) {
  return {
    verdict,
    confidence: null,
    productionReady: null,
    reasons: [],
    blockers: [],
    nextStep: null,
    ...extra
  };
}

function validateScreen(screen, i, dir, seen, errors, warnings) {
  const at = `interface.screens[${i}]`;
  if (!isObj(screen)) {
    errors.push(`${at}: must be an object`);
    return;
  }

  if (!SCREEN_ROLES.has(screen.role)) {
    errors.push(`${at}.role: "${screen.role}" (expected ${[...SCREEN_ROLES].join('|')})`);
  }
  if (typeof screen.path !== 'string' || !screen.path.trim()) {
    errors.push(`${at}.path: required`);
  } else {
    const unsafe = path.isAbsolute(screen.path) || screen.path.split(/[\\/]+/).includes('..');
    if (unsafe) {
      errors.push(`${at}.path: must be relative to fit.json and stay inside its folder`);
    }
    if (seen.has(screen.path)) errors.push(`${at}.path: duplicate ${screen.path}`);
    seen.add(screen.path);

    if (!unsafe) {
      const file = path.resolve(dir, screen.path);
      if (!fs.existsSync(file)) {
        errors.push(`${at}.path: missing ${screen.path}`);
      } else {
        try {
          const dim = execFileSync('ffprobe', [
            '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file
          ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
          const [w, h] = dim.split(',').map(Number);
          if (w && h) {
            if (w !== screen.width || h !== screen.height) {
              errors.push(`${at}: declared ${screen.width}x${screen.height}, actual ${w}x${h}`);
            }
            const landscape = w >= h;
            if (landscape && (w < 1600 || h < 900)) {
              warnings.push(`${at}: ${w}x${h} is small for a landscape screenshot (want >=1600x900)`);
            }
            if (!landscape && (h < 1600 || w < 1080)) {
              warnings.push(`${at}: ${w}x${h} is small for a portrait screenshot (want >=1080x1600)`);
            }
          }
        } catch {
          warnings.push(`${at}: could not read dimensions with ffprobe`);
        }
      }
    }
  }

  if (!Number.isInteger(screen.width) || screen.width <= 0) errors.push(`${at}.width: positive integer required`);
  if (!Number.isInteger(screen.height) || screen.height <= 0) errors.push(`${at}.height: positive integer required`);
  if (typeof screen.shows !== 'string' || !screen.shows.trim()) errors.push(`${at}.shows: required`);
}

export function validateFit(fit, dir = process.cwd()) {
  const errors = [];
  const warnings = [];

  if (!isObj(fit)) {
    return { errors: ['fit.json: must be an object'], warnings };
  }

  if (!isObj(fit.target)) {
    errors.push('target: required');
  } else {
    if (!TARGET_TYPES.has(fit.target.type)) {
      errors.push(`target.type: "${fit.target.type}" (expected ${[...TARGET_TYPES].join('|')})`);
    }
    if (fit.target.type === 'website' && !fit.target.url) {
      errors.push('target.url: required when target.type=website');
    }
    if (['app', 'miniprogram', 'plugin'].includes(fit.target.type) && !fit.target.ref) {
      errors.push('target.ref: required when target.type=app|miniprogram|plugin');
    }
  }

  if (typeof fit.checkedAt !== 'string') {
    errors.push('checkedAt: required (YYYY-MM-DD)');
  } else {
    const checked = parseDate(fit.checkedAt);
    if (!checked) {
      errors.push(`checkedAt: invalid date "${fit.checkedAt}"`);
    } else {
      const days = Math.floor((Date.now() - checked.getTime()) / 86400000);
      if (days > 30) warnings.push(`checkedAt is ${days} days old; re-check the site`);
    }
  }

  // A topic-only project has no website action or interface to validate.
  if (fit.target?.type === 'none') return { errors, warnings };

  if (!isObj(fit.action)) {
    warnings.push('action: missing; verdict will be not_fit');
  } else {
    if (!ACTION_TYPES.has(fit.action.type)) {
      errors.push(`action.type: "${fit.action.type}" (expected ${[...ACTION_TYPES].join('|')})`);
    }
    if (typeof fit.action.label !== 'string' || !fit.action.label.trim()) {
      errors.push('action.label: required');
    }
    if (!['verified', 'blocked', 'broken'].includes(fit.action.status)) {
      errors.push('action.status: expected verified|blocked|broken');
    }
    if (fit.action.primary != null && typeof fit.action.primary !== 'boolean') {
      errors.push('action.primary: boolean');
    }
    if (!fit.action.terminal) warnings.push('action.terminal: empty (needed for the endcard CTA)');
    if (fit.action.strength != null && !['strong', 'medium', 'weak'].includes(fit.action.strength)) {
      errors.push('action.strength: expected strong|medium|weak');
    }
  }

  if (fit.interface == null) {
    warnings.push('interface: missing');
  } else if (!isObj(fit.interface)) {
    errors.push('interface: must be an object');
  } else {
    for (const key of ['real', 'capturable', 'authRequired']) {
      if (fit.interface[key] != null && typeof fit.interface[key] !== 'boolean') {
        errors.push(`interface.${key}: boolean`);
      }
    }
    const screens = fit.interface.screens;
    if (screens != null && !Array.isArray(screens)) {
      errors.push('interface.screens: array');
    } else if (Array.isArray(screens)) {
      const seen = new Set();
      screens.forEach((screen, i) => validateScreen(screen, i, dir, seen, errors, warnings));
      if (screens.length === 0) warnings.push('interface.screens: empty; verdict will be needs_evidence or not_fit');
      if (screens.length > 0 && screens.length < 4) {
        warnings.push(`interface.screens: ${screens.length} (4-8 recommended for production)`);
      }
    }
  }

  if (fit.evidence != null && !isObj(fit.evidence)) {
    errors.push('evidence: must be an object');
  } else if (isObj(fit.evidence)) {
    const numbers = fit.evidence.numbers;
    if (numbers != null && !Array.isArray(numbers)) {
      errors.push('evidence.numbers: array');
    } else if (Array.isArray(numbers)) {
      numbers.forEach((n, i) => {
        if (!isObj(n) || typeof n.value !== 'string' || !n.value.trim()) {
          errors.push(`evidence.numbers[${i}].value: required`);
        } else if (!n.source) {
          warnings.push(`evidence.numbers[${i}].source: empty`);
        }
      });
    }
  }

  return { errors, warnings };
}

function confidenceFor(fit, screens) {
  const strength = fit.action?.strength || ACTION_STRENGTH[fit.action?.type] || 'medium';
  if (strength === 'weak') return 'low';

  const numbers = Array.isArray(fit.evidence?.numbers) ? fit.evidence.numbers.length : 0;
  if (strength === 'strong' && screens.length >= 4 && numbers >= 2) return 'high';
  if (screens.length >= 2 || numbers >= 1 || strength === 'medium') return 'medium';
  return 'low';
}

export function evaluateFit(fit) {
  if (fit?.target?.type === 'none') {
    return result('not_applicable', { reasons: ['非网站目标'] });
  }

  const action = fit?.action;
  if (!action || !ACTION_TYPES.has(action.type) || typeof action.label !== 'string' || !action.label.trim()) {
    return result('not_fit', {
      blockers: ['no_action'],
      reasons: ['没有可识别的动作']
    });
  }

  if (action.status === 'broken') {
    return result('not_fit', {
      blockers: ['unreachable_action'],
      reasons: ['动作不可达：死链 / 占位 / 已结束']
    });
  }

  if (action.status !== 'verified') {
    return result('needs_evidence', {
      nextStep: '确认动作可达；需要 demo 账号或测试账号'
    });
  }

  const screens = Array.isArray(fit.interface?.screens) ? fit.interface.screens : [];
  const noScreen =
    fit.interface?.real === false ||
    fit.interface?.capturable === false ||
    screens.length === 0;

  if (noScreen) {
    if (fit.nextStep) {
      return result('needs_evidence', { nextStep: fit.nextStep });
    }
    return result('not_fit', {
      blockers: ['no_capturable_interface'],
      reasons: ['没有可截图的真实页面']
    });
  }

  const roles = new Set(screens.map(s => s.role));
  const productionReady = screens.length >= 4 && roles.has('action') && roles.has('result');
  const numbers = Array.isArray(fit.evidence?.numbers) ? fit.evidence.numbers.length : 0;

  return result('fit', {
    confidence: confidenceFor(fit, screens),
    productionReady,
    reasons: [
      `动作：${action.label} (${action.type})`,
      `截图：${screens.length} 张`,
      numbers ? `真实数字：${numbers} 个` : '真实数字：0 个',
      productionReady ? '截图覆盖动作和结果' : '截图偏少，成片需多用字卡'
    ],
    nextStep: productionReady ? null : '建议补到 4 张以上，覆盖 action/result'
  });
}

export function copyFitRecord(fitFile, root) {
  const abs = path.resolve(fitFile);
  const dir = path.dirname(abs);
  const fit = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const rootAbs = path.resolve(root);
  const fitDest = path.join(rootAbs, 'fit.json');

  if (path.resolve(abs) !== fitDest) fs.copyFileSync(abs, fitDest);

  for (const screen of fit.interface?.screens || []) {
    if (typeof screen.path !== 'string') continue;
    const src = path.resolve(dir, screen.path);
    const dest = path.resolve(rootAbs, screen.path);
    if (dest !== rootAbs && !dest.startsWith(rootAbs + path.sep)) {
      throw new Error(`screen path escapes project: ${screen.path}`);
    }
    if (path.resolve(src) === dest) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  return fitDest;
}

export function writeTopicFit(root, name) {
  const fit = {
    version: 1,
    target: { type: 'none', name: name || 'topic' },
    reason: '非网站目标',
    checkedAt: today()
  };
  fs.writeFileSync(path.join(root, 'fit.json'), JSON.stringify(fit, null, 2) + '\n');
  return fit;
}
