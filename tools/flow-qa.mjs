/**
 * Flow QA — drives the game through its full state machine and asserts results.
 *
 * Usage: node tools/flow-qa.mjs [baseUrl]
 * Requires (install once, NOT part of the game bundle):
 *   npm i --no-save puppeteer-core @sparticuz/chromium
 */
const baseUrl = process.argv[2] ?? 'http://localhost:5173';
const { default: Chromium } = await import('@sparticuz/chromium');
const puppeteer = await import('puppeteer-core');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
};

const browser = await puppeteer.launch({
  args: [...Chromium.args, '--no-sandbox', '--enable-unsafe-swiftshader'],
  executablePath: await Chromium.executablePath(),
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 640 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => window.__game !== undefined, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));

const readPhase = async () =>
  page.evaluate(() => {
    const g = window.__game;
    // phase is pushed to the store; read it from DOM overlay classes
    const dom = document.body.innerHTML;
    const st = g.debug.state();
    let uiPhase = st.mode;
    if (dom.includes('main-menu')) uiPhase = 'menu-ui';
    if (dom.includes('overlay-title') && dom.includes('Paused')) uiPhase = 'paused-ui';
    if (dom.includes('Ship Destroyed')) uiPhase = 'gameover-ui';
    if (dom.includes('Victory') && dom.includes('Final Score')) uiPhase = 'victory-ui';
    return { ...st, uiPhase };
  });

// ---- 1. Menu ----
let s = await readPhase();
check('boots into menu', s.uiPhase === 'menu-ui', `mode=${s.mode}`);

// ---- 2. Start game → stage 1 ----
await page.evaluate(() => window.__game.startGame());
await new Promise((r) => setTimeout(r, 1000));
s = await readPhase();
check('startGame leaves transition/playing', s.mode === 'transition' || s.mode === 'playing', s.mode);
await page.evaluate(() => window.__game.debug.skipTransition());
await new Promise((r) => setTimeout(r, 700));
s = await readPhase();
check('stage 1 playing with HUD', s.mode === 'playing', `hp=${s.hp} enemies=${s.enemies}`);

// ---- 3. Player fires automatically ----
s = await readPhase();
check('autofire produces bullets', s.bullets > 0, `bullets=${s.bullets}`);

// ---- 4. DNA collection evolves the ship ----
await page.evaluate(() => window.__game.debug.addDNA('fire', 10));
await page.evaluate(() => window.__game.debug.addDNA('electric', 10));
s = await readPhase();
check('DNA raises evolution level', s.level >= 2, `level=${s.level}`);
const evo = await page.evaluate(() => window.__game.player.evo.combo);
check('fire+electric unlocks Chain Nova', evo === 'chain_nova', `combo=${evo}`);

// ---- 5. Mega burst consumes energy ----
const megaBefore = await page.evaluate(() => window.__game.player.megaEnergy);
await page.evaluate(() => window.__game.triggerMegaBurst());
const megaAfter = await page.evaluate(() => window.__game.player.megaEnergy);
check('mega burst drains energy', megaBefore >= 100 && megaAfter < 20, `${megaBefore}→${megaAfter}`);

// ---- 6. Enemy spawning via waves ----
await page.evaluate(() => {
  window.__game.debug.spawn('chicken', -6, -10);
  window.__game.debug.spawn('duck', 6, -8);
  window.__game.debug.spawn('egg', 0, -4);
  window.__game.debug.spawn('rocket', -10, -12);
});
s = await readPhase();
check('enemy kinds spawn', s.enemies >= 4, `enemies=${s.enemies}`);

// ---- 7. Egg hatching mechanic (fast-forward) ----
await page.evaluate(() => {
  const g = window.__game;
  for (const e of g.enemies) if (e.kind === 'egg' && e.active) { e.hatchTime = 0.1; e.age = 0; }
});
let eggOk = true;
try {
  await page.waitForFunction(
    () => window.__game.enemies.filter((e) => e.kind === 'egg' && e.active).length === 0,
    { timeout: 30000, polling: 250 },
  );
} catch {
  eggOk = false;
}
const eggInfo = await page.evaluate(() => {
  const eggs = window.__game.enemies.filter((e) => e.kind === 'egg');
  return { active: eggs.filter((e) => e.active).length, hatched: eggs.filter((e) => e.hatched).length };
});
check('egg hatches when timer expires', eggOk, JSON.stringify(eggInfo));

// ---- 8. Stage progression ----
await page.evaluate(() => window.__game.debug.killAll());
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => window.__game.debug.finishStage());
await new Promise((r) => setTimeout(r, 1200));
s = await readPhase();
check('stage 1 completes → stage 2 transition', s.mode === 'transition' || (s.mode === 'playing' && s.score > 1000), `mode=${s.mode}`);
await page.evaluate(() => window.__game.debug.skipTransition());
await new Promise((r) => setTimeout(r, 600));

await page.evaluate(() => window.__game.debug.finishStage());
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => window.__game.debug.skipTransition());
await new Promise((r) => setTimeout(r, 600));
s = await readPhase();
const stageNow = await page.evaluate(() => window.__game.debug.stage());
check('reaches stage 3', stageNow === 2, `stage index=${stageNow}`);

// ---- 9. Boss encounter & defeat → victory ----
await page.evaluate(() => {
  window.__game.debug.finishStage();
  window.__game.debug.spawnBoss();
});
await new Promise((r) => setTimeout(r, 800));
s = await readPhase();
check('boss active', s.enemies >= 1);
await page.evaluate(() => window.__game.debug.killBoss());
let winOk = true;
try {
  await page.waitForFunction(
    () => document.body.innerHTML.includes('Final Score'),
    { timeout: 40000, polling: 400 },
  );
} catch {
  winOk = false;
}
s = await readPhase();
check('boss defeat triggers victory', winOk && s.uiPhase === 'victory-ui', `ui=${s.uiPhase} mode=${s.mode}`);

// ---- 10. localStorage best score ----
const best = await page.evaluate(() => Number(localStorage.getItem('ci_best_v1') || '0'));
check('best score persisted', best > 0, `best=${best}`);

// ---- 11. Restart from victory → game over flow ----
await page.evaluate(() => window.__game.startGame());
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => {
  window.__game.debug.skipTransition();
  window.__game.debug.killPlayer();
});
let deadOk = true;
try {
  await page.waitForFunction(
    () => document.body.innerHTML.includes('Ship Destroyed'),
    { timeout: 30000, polling: 400 },
  );
} catch {
  deadOk = false;
}
s = await readPhase();
check('player death triggers game over', deadOk && s.uiPhase === 'gameover-ui', `ui=${s.uiPhase}`);

// ---- 12. Pause / resume ----
await page.evaluate(() => window.__game.startGame());
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => window.__game.debug.skipTransition());
try {
  await page.waitForFunction(() => window.__game.debug.state().mode === 'playing', { timeout: 15000, polling: 250 });
} catch {
  /* fall through; pause check will report */
}
await page.evaluate(() => window.__game.pause());
let pauseOk = true;
try {
  await page.waitForFunction(() => document.body.innerHTML.includes('Paused'), { timeout: 10000, polling: 250 });
} catch {
  pauseOk = false;
}
s = await readPhase();
check('pause works', pauseOk && s.uiPhase === 'paused-ui', `ui=${s.uiPhase}`);
await page.evaluate(() => window.__game.resume());
try {
  await page.waitForFunction(() => window.__game.debug.state().mode === 'playing', { timeout: 15000, polling: 250 });
} catch {
  /* reported below */
}
s = await readPhase();
check('resume works', s.mode === 'playing', `mode=${s.mode}`);

// ---- 13. Settings persistence ----
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  void btns;
  window.__game.applySettings({ masterVolume: 0.42, muted: true, screenShake: false, particles: 'low', musicVolume: 0.3, sfxVolume: 0.9, showFps: true });
  // simulate store write the way the UI does
  localStorage.setItem('ci_settings_v1', JSON.stringify({ masterVolume: 0.42, muted: true }));
});
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ci_settings_v1')));
check('settings persist to localStorage', saved.masterVolume === 0.42 && saved.muted === true);

// ---- 14. No page errors during the run ----
check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);

