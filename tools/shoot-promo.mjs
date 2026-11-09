import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const pairs = [
  ['runs/kinetic-promo/assets/src/timeline.html', 'runs/kinetic-promo/assets/stills/timeline.png'],
  ['runs/kinetic-promo/assets/src/terminal.html', 'runs/kinetic-promo/assets/stills/terminal.png']
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
for (const [html, png] of pairs) {
  await page.goto(pathToFileURL(path.resolve(html)).href);
  await page.screenshot({ path: path.resolve(png) });
  console.log(png);
}
await browser.close();
