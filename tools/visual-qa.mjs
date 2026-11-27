/**
 * Visual QA helper — launches headless Chromium (SwiftShader WebGL) and captures
 * screenshots of game states for visual inspection.
 *
 * Usage: node tools/visual-qa.mjs [baseUrl] [outdir]
 * Requires (install once, NOT part of the game bundle):
 *   npm i --no-save puppeteer-core @sparticuz/chromium
 * On systems missing Chromium's shared libs, extract @sparticuz/chromium/bin/al2023.tar.br
 * and run with LD_LIBRARY_PATH pointing at its lib dir.
 */
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.argv[2] ?? 'http://localhost:5173';
const outdir = process.argv[3] ?? 'tools/shots';

const { default: Chromium } = await import('@sparticuz/chromium');
const puppeteer = await import('puppeteer-core');

fs.mkdirSync(outdir, { recursive: true });

const browser = await puppeteer.launch({
  args: [...Chromium.args, '--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  executablePath: await Chromium.executablePath(),
  headless: true,
});

const page = await browser.newPage();
page.on('console', (msg) => {
  const t = msg.type();
  if (t === 'error' || t === 'warning') console.log(`[console.${t}]`, msg.text());
});
page.on('pageerror', (err) => console.log('[pageerror]', err.message));

async function shot(name, w = 1280, h = 720) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 450));
  await page.screenshot({ path: path.join(outdir, `${name}.png`) });
  console.log('captured', name);
}

async function waitForGame() {
  await page.waitForFunction(() => window.__game !== undefined, { timeout: 30000 });
  // wait for a few rendered frames
  await new Promise((r) => setTimeout(r, 1200));
}

await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
await waitForGame();

// 1. Main menu (desktop)
await shot('01-menu-desktop');

// 2. Start game → stage 1
await page.evaluate(() => window.__game.startGame());
await new Promise((r) => setTimeout(r, 3500));
await page.evaluate(() => window.__game.debug.skipTransition());
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__game.debug.clearInvuln());
await new Promise((r) => setTimeout(r, 300));
await shot('02-stage1-gameplay');

// 3. Evolved ship (max evolution, all DNA)
await page.evaluate(() => window.__game.debug.maxEvolve());
await new Promise((r) => setTimeout(r, 900));
await shot('03-stage1-evolved');

// 4. Mega burst
await page.evaluate(() => window.__game.triggerMegaBurst());
await new Promise((r) => setTimeout(r, 350));
await shot('04-mega-burst');

// 5. Stage 2 nebula
await page.evaluate(() => window.__game.debug.setStage(1));
await new Promise((r) => setTimeout(r, 3200));
await page.evaluate(() => window.__game.debug.skipTransition());
await new Promise((r) => setTimeout(r, 2200));
await page.evaluate(() => {
  window.__game.debug.spawn('duck', -8, -6);
  window.__game.debug.spawn('duck', 8, -8);
  window.__game.debug.spawn('egg', 0, -4);
  window.__game.debug.spawn('rocket', -12, -12);
  window.__game.debug.spawn('chicken', 4, -12);
  window.__game.debug.spawn('chicken', -4, -14);
});
await new Promise((r) => setTimeout(r, 1600));
await shot('05-stage2-enemies');

// 6. Stage 3 armada + boss
await page.evaluate(() => window.__game.debug.setStage(2));
await new Promise((r) => setTimeout(r, 3200));
await page.evaluate(() => window.__game.debug.skipTransition());
await new Promise((r) => setTimeout(r, 1800));
await page.evaluate(() => window.__game.debug.spawnBoss());
await new Promise((r) => setTimeout(r, 2600));
await shot('06-stage3-boss');

// 7. Pause menu
await page.evaluate(() => window.__game.pause());
await new Promise((r) => setTimeout(r, 500));
await shot('07-pause');

// 8. Game over
await page.evaluate(() => {
  window.__game.resume();
  window.__game.debug.killPlayer();
});
await new Promise((r) => setTimeout(r, 3000));
await shot('08-gameover');

// 9. Mobile viewport
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.evaluate(() => window.__game.startGame());
await new Promise((r) => setTimeout(r, 3600));
await page.evaluate(() => {
  window.__game.debug.skipTransition();
  window.__game.debug.clearInvuln();
});
await new Promise((r) => setTimeout(r, 2200));
await shot('09-mobile-gameplay', 390, 844);

const state = await page.evaluate(() => window.__game.debug.state());
console.log('final state:', JSON.stringify(state));

// 10. Settings panel
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.evaluate(() => window.__game.quitToMenu());
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => {
  const storeBtns = [...document.querySelectorAll('button')];
  const b = storeBtns.find((x) => x.textContent.trim() === 'Settings');
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 600));
await shot('10-settings');

// 11. Help screen
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const done = btns.find((x) => x.textContent.trim() === 'Done');
  if (done) done.click();
});
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const help = btns.find((x) => x.textContent.trim() === 'How to Play');
  if (help) help.click();
});
await new Promise((r) => setTimeout(r, 500));
await shot('11-help');

// 12. Stage transition card
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const back = btns.find((x) => x.textContent.trim() === 'Back');
  if (back) back.click();
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => window.__game.startGame());
await new Promise((r) => setTimeout(r, 800));
await shot('12-stage-transition');

// 13. Victory screen
await page.evaluate(() => {
  window.__game.debug.skipTransition();
  window.__game.debug.spawnBoss();
  window.__game.debug.killBoss();
});
await new Promise((r) => setTimeout(r, 200));
await page
  .waitForFunction(() => document.body.innerHTML.includes('Final Score'), { timeout: 40000, polling: 400 })
  .catch(() => {});
await new Promise((r) => setTimeout(r, 400));
await shot('13-victory');

// 14. Busy battle shot — a full formation + DNA drops
await page.evaluate(() => window.__game.startGame());
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => {
  const g = window.__game;
  g.debug.skipTransition();
  g.debug.clearInvuln();
  for (let i = 0; i < 7; i++) g.debug.spawn('chicken', (i - 3) * 3.4, -8 - Math.abs(i - 3) * 2.2);
  g.debug.spawn('duck', -9, -5);
  g.debug.spawn('duck', 9, -6);
  g.debug.spawn('egg', 0, -3);
  g.debug.spawn('rocket', -13, -11);
  g.debug.maxEvolve();
});
await new Promise((r) => setTimeout(r, 2600));
await page.evaluate(() => window.__game.debug.clearInvuln());
await new Promise((r) => setTimeout(r, 300));
await shot('14-battle');

await browser.close();
console.log('done');
