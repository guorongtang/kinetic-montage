// Full regression: rebuild v13 and require a byte-identical mp4.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const EXPECTED = '49c19e0e0236d74d39b3d6de8c26c6eb';
const out = path.resolve('examples/v13-regression/out/v13-rebuild.mp4');

execFileSync('node', ['bin/kinetic.mjs', 'build', 'examples/v13-regression', '--name', 'v13-rebuild', '--quiet'], {
  stdio: 'inherit'
});

const md5 = crypto.createHash('md5').update(fs.readFileSync(out)).digest('hex');
console.log('md5', md5);
if (md5 !== EXPECTED) {
  console.error(`FAIL: expected ${EXPECTED}`);
  process.exit(1);
}
console.log('PASS: v13 rebuilt byte-identically');
