/**
 * GameEngine — owns the Three.js renderer/scene/camera, the game loop,
 * all gameplay systems and the flow between menu, stages, boss and endings.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { PLAYER, SCORE, WORLD } from './constants';
import { Environment } from './Environment';
import { Player } from './Player';
import { Projectiles, type Projectile } from './Projectiles';
import { Particles } from './Particles';
import { Pickups } from './Pickups';
import {
  ArmoredDuck,
  AlienEgg,
  ChickenOverlord,
  MiniBoss,
  RocketChicken,
  SpaceChicken,
  type Enemy,
  type EnemyContext,
  type EnemyInit,
} from './enemies';
import { STAGES, StageDirector, type WaveAction } from './StageDirector';
import { AudioEngine } from './AudioEngine';
import { InputManager } from './input';
import type { DNAKind, EnemyKind, GamePhase, Settings } from './types';
import { clamp, dist2DSq, randRange } from './utils';
import { loadBestScore, saveBestScore, useGameStore } from '../state';

type EngineMode = 'menu' | 'playing' | 'transition' | 'boss_intro' | 'boss_dead' | 'gameover' | 'victory' | 'paused';

const DNA_DROP_TABLE: Record<EnemyKind, { chance: number; count: [number, number] }> = {
  chicken: { chance: 0.62, count: [1, 1] },
  duck: { chance: 1, count: [2, 2] },
  rocket: { chance: 0.72, count: [1, 1] },
  egg: { chance: 1, count: [2, 3] },
  miniboss: { chance: 1, count: [5, 6] },
  boss: { chance: 0, count: [0, 0] },
};

const KIND_SCORE: Record<EnemyKind, number> = {
  chicken: SCORE.KILL_CHICKEN,
  duck: SCORE.KILL_DUCK,
  rocket: SCORE.KILL_ROCKET,
  egg: SCORE.KILL_EGG,
  miniboss: SCORE.KILL_MINIBOSS,
  boss: SCORE.KILL_BOSS,
};

const DNA_COLORS: Record<DNAKind, number> = {
  fire: 0xff9a4a,
  plasma: 0xd88aff,
  ice: 0x8ad8ff,
  electric: 0xffe23a,
};

export class GameEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;

  readonly audio = new AudioEngine();
  readonly input = new InputManager();
  readonly environment: Environment;
  readonly player: Player;
  readonly projectiles: Projectiles;
  readonly particles: Particles;
  readonly pickUps: Pickups;
  readonly director = new StageDirector();

  private enemies: Enemy[] = [];
  private raf = 0;
  private lastT = 0;
  private mode: EngineMode = 'menu';
  private modeBeforePause: EngineMode = 'playing';
  private time = 0;
  private hitStopT = 0;
  private slowMo = 1;
  private slowMoT = 0;
  private deathStart = 0;
  private bossDeathStart = 0;
  private bossIntroStart = 0;

  private score = 0;
  private stageIndex = 0;
  private stageTransitionT = 0;
  private bossIntroT = 0;
  private bossDeathT = 0;
  private survivalTick = 0;

  private trauma = 0;
  private camX = 0;
  private camZ = 0;

  private hudTimer = 0;
  private shieldTimer = 0;
  private fpsAccum = 0;
  private fpsCount = 0;
  private fpsValue = 0;

  private floaterPool: HTMLDivElement[] = [];
  private floaterWrap: HTMLElement | null = null;

  private settings: Settings;
  private running = false;
  private disposed = false;

  onPhaseChange: ((phase: GamePhase) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setClearColor(0x04060f, 1);

    this.camera = new THREE.OrthographicCamera(-30, 30, 25, -25, 0.1, 220);
    this.camera.position.set(0, 34, 0);
    this.camera.lookAt(0, 0, 0);
    this.camera.up.set(0, 0, -1);

    this.environment = new Environment(this.scene, this.renderer);
    this.scene.add(this.environment.group);

    this.particles = new Particles(settings.particles);
    this.scene.add(this.particles.group);

    this.projectiles = new Projectiles(this.particles);
    this.scene.add(this.projectiles.group);

    this.pickUps = new Pickups();
    this.scene.add(this.pickUps.group);

    this.player = new Player();
    this.scene.add(this.player.group);

    this.buildEnemyPools();

    // postprocessing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(800, 600), 0.62, 0.68, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // player event hooks
    this.player.onLevelUp = () => {
      this.audio.evolve();
      this.shake(0.85);
      const p = this.player.group.position;
      this.particles.ring(p.x, 0.6, p.z, 12, new THREE.Color(0xb06bff), 0.9);
      this.particles.ring(p.x, 0.7, p.z, 7, new THREE.Color(0x66e0ff), 0.6);
      this.particles.flash(p.x, 1.2, p.z, 7, new THREE.Color(0xc88aff), 0.4);
      this.particles.burst(p.x, 1, p.z, {
        count: 60,
        speed: 16,
        size: 0.6,
        life: 1,
        color: new THREE.Color(0x8ae8ff),
        color2: new THREE.Color(0xd86aff),
      });
      this.addFloater(p.x, p.z, `EVOLUTION LV.${this.player.evoLevel}`, '#d88aff');
      useGameStore.getState().showToast(`LIVING SHIP EVOLVED — LEVEL ${this.player.evoLevel}`);
    };
    this.player.onMegaBurst = () => {
      this.audio.mega();
      this.shake(1.25);
      this.hitStop(0.12);
    };

    this.input.onAction = (action) => {
      const store = useGameStore.getState();
      if (action === 'burst') {
        if (this.mode === 'playing' || this.mode === 'boss_intro') this.triggerMegaBurst();
      } else if (action === 'pause') {
        if (this.mode === 'playing' || this.mode === 'boss_intro') {
          this.pause();
        } else if (this.mode === 'paused') {
          this.resume();
        }
      } else if (action === 'mute') {
        store.setSettings({ muted: !store.settings.muted });
      } else if (action === 'confirm') {
        if (this.mode === 'menu') this.startGame();
        else if (this.mode === 'gameover' || this.mode === 'victory') this.startGame();
      }
    };

    this.floaterWrap = document.createElement('div');
    this.floaterWrap.className = 'floater-wrap';
    canvas.parentElement?.appendChild(this.floaterWrap);
  }

  /* ---------------------------------------------------------------- */
  /* Setup                                                             */
  /* ---------------------------------------------------------------- */

  private buildEnemyPools(): void {
    const add = (e: Enemy) => {
      this.enemies.push(e);
      this.scene.add(e.group);
    };
    for (let i = 0; i < 22; i++) add(new SpaceChicken(true));
    for (let i = 0; i < 8; i++) add(new ArmoredDuck());
    for (let i = 0; i < 10; i++) add(new RocketChicken());
    for (let i = 0; i < 8; i++) add(new AlienEgg());
    add(new MiniBoss());
    add(new ChickenOverlord());
  }

  attach(container: HTMLElement, canvas: HTMLCanvasElement): void {
    this.input.attach(canvas);
    this.resize();
    window.addEventListener('resize', this.resize);
    void container;
  }

  resize = (): void => {
    const canvas = this.renderer.domElement;
    const parent = canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);

    const aspect = w / h;
    let viewH = WORLD.VIEW_HEIGHT;
    let viewW = viewH * aspect;
    if (viewW < WORLD.VIEW_WIDTH_MIN) {
      viewW = WORLD.VIEW_WIDTH_MIN;
      viewH = viewW / aspect;
    } else if (viewW > WORLD.VIEW_WIDTH_MAX) {
      viewW = WORLD.VIEW_WIDTH_MAX;
      viewH = viewW / aspect;
    }
    this.camera.left = -viewW / 2;
    this.camera.right = viewW / 2;
    this.camera.top = viewH / 2;
    this.camera.bottom = -viewH / 2;
    this.camera.updateProjectionMatrix();
    this.particles.setPixelScale(h / viewH / dpr);
  };

  private get viewW(): number {
    return this.camera.right - this.camera.left;
  }

  private get viewH(): number {
    return this.camera.top - this.camera.bottom;
  }

  get bounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    return {
      minX: -this.viewW / 2 + WORLD.PAD_X,
      maxX: this.viewW / 2 - WORLD.PAD_X,
      minZ: -this.viewH / 2 + WORLD.PAD_TOP,
      maxZ: this.viewH / 2 - WORLD.PAD_BOTTOM,
    };
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.audio.setVolumes(s);
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now() / 1000;
    this.loop();
    this.enterMenu();
    // QA/debug hook (used by tools/visual-qa.mjs and manual testing)
    (window as unknown as Record<string, unknown>).__game = this;
  }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.input.detach();
    this.audio.dispose();
    this.environment.dispose();
    this.player.dispose();
    this.projectiles.dispose();
    this.particles.dispose();
    this.pickUps.dispose();
    for (const e of this.enemies) e.despawn();
    this.renderer.dispose();
    this.floaterWrap?.remove();
  }

  /* ---------------------------------------------------------------- */
  /* Flow                                                              */
  /* ---------------------------------------------------------------- */

  private setPhase(phase: GamePhase): void {
    useGameStore.getState().setPhase(phase);
    this.onPhaseChange?.(phase);
  }

  enterMenu(): void {
    this.mode = 'menu';
    this.setPhase('menu');
    this.audio.unlock();
    this.audio.startTheme('menu');
    this.environment.setStage(0);
    // showcase: park player in the lower-middle, idle
    this.player.reset();
    this.player.invuln = 0;
    this.player.group.position.set(0, 0, 10.5);
    this.clearField();
  }

  startGame(): void {
    this.audio.unlock();
    this.audio.uiClick();
    this.score = 0;
    this.stageIndex = 0;
    this.deathT = 0;
    this.player.reset();
    this.clearField();
    this.beginStage(0);
  }

  pause(): void {
    if (this.mode !== 'playing' && this.mode !== 'boss_intro') return;
    this.modeBeforePause = this.mode;
    this.mode = 'paused';
    this.setPhase('paused');
    this.audio.uiClick();
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = this.modeBeforePause;
    this.setPhase('playing');
    this.audio.uiClick();
    this.lastT = performance.now() / 1000;
  }

  quitToMenu(): void {
    this.clearField();
    this.enterMenu();
    this.audio.uiClick();
  }

  private clearField(): void {
    for (const e of this.enemies) e.despawn();
    this.projectiles.clear('all');
    this.pickUps.clear();
  }

  private beginStage(index: number): void {
    this.stageIndex = index;
    this.director.start(index);
    this.environment.setStage(index);
    this.mode = 'transition';
    this.stageTransitionT = 2.9;
    const def = STAGES[index];
    useGameStore.getState().setStageTransition({ stage: index + 1, name: def.name, subtitle: def.subtitle });
    this.setPhase('transition');
    this.audio.startTheme(`stage${index + 1}` as 'stage1' | 'stage2' | 'stage3');
    // top the player up between stages
    if (index > 0) {
      this.player.heal(1);
      this.score += SCORE.STAGE_CLEAR;
    }
    useGameStore.getState().setHud({
      stage: index + 1,
      stageName: def.name,
    });
  }

  private stageComplete(): void {
    if (this.stageIndex < STAGES.length - 1) {
      this.beginStage(this.stageIndex + 1);
    }
  }

  private gameOver(): void {
    this.mode = 'gameover';
    this.audio.stopMusic();
    this.audio.defeat();
    saveBestScore(Math.max(loadBestScore(), this.score));
    this.pushHUD(true);
    this.setPhase('gameover');
  }

  private victory(): void {
    this.mode = 'victory';
    this.audio.stopMusic();
    this.audio.victory();
    this.score += SCORE.STAGE_CLEAR * 3;
    saveBestScore(Math.max(loadBestScore(), this.score));
    this.pushHUD(true);
    this.setPhase('victory');
  }

  /* ---------------------------------------------------------------- */
  /* Loop                                                              */
  /* ---------------------------------------------------------------- */

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now() / 1000;
    let dt = Math.min(0.05, Math.max(0.0005, now - this.lastT));
    this.lastT = now;

    // fps meter
    this.fpsAccum += dt;
    this.fpsCount++;
    if (this.fpsAccum > 0.5) {
      this.fpsValue = this.fpsCount / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsCount = 0;
    }

    // hit-stop & slow-mo
    if (this.hitStopT > 0) {
      this.hitStopT -= dt;
      dt *= 0.1;
    }
    if (this.slowMoT > 0) {
      this.slowMoT -= dt;
      dt *= this.slowMo;
    }

    this.time += dt;
    const playing = this.mode === 'playing' || this.mode === 'boss_intro' || this.mode === 'boss_dead' || this.mode === 'transition';

    if (this.mode === 'menu') {
      this.updateMenu(dt);
    } else if (playing) {
      this.updateGameplay(dt);
    } else if (this.mode === 'gameover' || this.mode === 'victory') {
      // keep visuals alive behind the end screens
      this.particles.update(dt);
      this.environment.update(dt, this.camX, this.camZ);
    }

    // camera update (always)
    this.updateCamera(dt);
    this.composer.render();
  };

  private updateMenu(dt: number): void {
    // slow showcase orbit + idle particles
    const t = this.time;
    this.player.update(dt, 0, 0, this.bounds);
    this.player.group.position.set(Math.sin(t * 0.32) * 2.6, 0, 11 + Math.sin(t * 0.21) * 1.1);
    this.player.group.rotation.y = Math.sin(t * 0.26) * 0.42;
    this.player.group.rotation.z = Math.sin(t * 0.4) * 0.1;
    this.player.group.scale.setScalar(1.18);
    this.environment.update(dt, this.camX, this.camZ);
    this.projectiles.update(dt);
    this.particles.update(dt);
    this.pickUps.update(dt, t, 0, -99, false, this.particles, () => {});
    if (Math.random() < dt * 2.2) {
      this.particles.spawn(
        randRange(-18, 18),
        randRange(-1, 2),
        randRange(-16, 10),
        randRange(-0.6, 0.6),
        randRange(0.2, 1),
        randRange(-0.6, 0.6),
        new THREE.Color(Math.random() < 0.5 ? 0x33ccff : 0xb06bff),
        0.5,
        0.42,
        2.6,
        0.35,
      );
    }
  }

  private updateGameplay(dt: number): void {
    const store = useGameStore.getState();

    // stage transition overlay timing
    if (this.mode === 'transition') {
      this.stageTransitionT -= dt;
      if (this.stageTransitionT <= 0) {
        this.mode = 'playing';
        this.setPhase('playing');
        store.setStageTransition(null);
      }
    }

    // boss intro cinematic (wall-clock so it feels consistent at any fps)
    if (this.mode === 'boss_intro') {
      this.bossIntroT = performance.now() / 1000 - this.bossIntroStart;
      const boss = this.getBoss();
      if (boss) {
        const p = boss.group.position;
        p.z = THREE.MathUtils.lerp(-30, -6.2, Math.min(1, this.bossIntroT / 2.6));
        if (this.bossIntroT > 2.55 && this.bossIntroT - dt <= 2.55) {
          this.audio.bossRoar();
          this.shake(1.1);
          this.particles.ring(p.x, 1.5, p.z, 18, new THREE.Color(0xff2a8a), 1.1);
        }
        if (this.bossIntroT > 3.1) {
          this.mode = 'playing';
          this.setPhase('playing');
          boss.init(p.x, p.z);
        }
      } else {
        this.mode = 'playing';
      }
    }

    // boss death cinematic (wall-clock)
    if (this.mode === 'boss_dead') {
      this.bossDeathT = performance.now() / 1000 - this.bossDeathStart;
      if (this.bossDeathT > 3.1) {
        const boss = this.getBoss();
        if (boss) boss.despawn();
        this.victory();
        return;
      }
    }

    const playerAlive = this.player.alive;

    // player
    const move = this.input.getMove();
    this.player.update(dt, move.x, move.z, this.bounds);
    // shield ring while invulnerable
    if (this.player.invuln > 0 && this.player.alive) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) {
        this.shieldTimer = 0.42;
        this.particles.ring(this.player.x, 0.7, this.player.z, 4.6, new THREE.Color(0x66e0ff), 0.42);
      }
    }
    if (this.mode === 'playing' || this.mode === 'boss_intro') {
      this.player.advanceFire(dt, {
        projectiles: this.projectiles,
        particles: this.particles,
        damageMult: 1,
      });
    }

    // stage director spawns
    if (this.mode === 'playing') {
      this.director.update(dt, (action) => this.emitWaveAction(action));
    }

    // enemy context
    const ctx: EnemyContext = {
      time: this.time,
      dt,
      playerX: this.player.x,
      playerZ: this.player.z,
      playerAlive,
      particles: this.particles,
      projectiles: this.projectiles,
      fire: (opts) => {
        this.projectiles.fire(opts);
        if (Math.random() < 0.5) this.audio.enemyShoot();
      },
      spawnEnemy: (kind, x, z, init) => this.spawnEnemy(kind, x, z, init),
      damagePlayerIfNear: (x, z, radius, damage) => {
        if (dist2DSq(x, z, this.player.x, this.player.z) < radius * radius) {
          this.hurtPlayer(damage);
        }
      },
      shake: (a) => this.shake(a),
    };

    // enemies update + removal
    for (const e of this.enemies) {
      if (!e.active) continue;
      e.update(ctx);
      if (e.hp <= 0) {
        if (e.kind === 'boss') {
          this.onBossDefeated(e as ChickenOverlord);
        } else if (e.kind === 'egg' && (e as AlienEgg).hatched) {
          e.despawn(); // hatched: no score, spawns already created
        } else {
          this.killEnemy(e);
        }
      } else if (e.group.position.z > this.viewH / 2 + 10 || Math.abs(e.group.position.x) > this.viewW / 2 + 16) {
        e.despawn(); // drifted far away
      }
    }

    // projectiles + collisions
    this.projectiles.update(dt);
    this.handleCollisions();

    // pickups
    this.pickUps.update(dt, this.time, this.player.x, this.player.z, playerAlive, this.particles, (kind) => {
      if (kind === 'health') {
        this.player.heal(1);
        this.audio.health();
        this.addFloater(this.player.x, this.player.z, '+1 HULL', '#8affc0');
      } else {
        const leveled = this.player.collectDNA(kind, 1);
        this.audio.pickup();
        this.score += SCORE.DNA_PICKUP;
        if (!leveled) {
          this.addFloater(this.player.x, this.player.z - 1, `+${kind.toUpperCase()} DNA`, `#${DNA_COLORS[kind].toString(16).padStart(6, '0')}`);
        }
      }
    });

    // particles
    this.particles.update(dt);

    // survival score
    this.survivalTick += dt;
    if (this.survivalTick > 1) {
      this.survivalTick = 0;
      this.score += SCORE.SURVIVAL_TICK;
    }

    // environment
    this.environment.update(dt, this.camX, this.camZ);

    // stage completion check
    if (this.mode === 'playing') {
      const anyEnemyAlive = this.enemies.some((e) => e.active && e.kind !== 'boss');
      const bossAlive = this.enemies.some((e) => e.active && e.kind === 'boss');
      if (this.director.timelineDone && !anyEnemyAlive && !bossAlive && this.stageIndex < STAGES.length - 1) {
        this.stageComplete();
      }
    }

    // player death
    if (!playerAlive && this.mode !== 'gameover' && this.mode !== 'boss_dead') {
      this.deathSequence(dt);
    }

    this.pushHUD();
    void store;
  }

  private deathT = 0;
  private deathSequence(dt: number): void {
    void dt;
    if (this.deathT === 0) {
      this.deathStart = performance.now() / 1000;
      this.audio.explosion(true);
      this.shake(1.4);
      const p = this.player.group.position;
      this.particles.explosion(p.x, 1.2, p.z, 2.1);
      this.player.group.visible = false;
    }
    this.deathT = performance.now() / 1000 - this.deathStart;
    if (this.deathT > 1.7) {
      this.deathT = 0;
      this.gameOver();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Spawning & waves                                                  */
  /* ---------------------------------------------------------------- */

  private emitWaveAction(action: WaveAction): void {
    const half = this.viewW / 2;
    switch (action.type) {
      case 'message':
        useGameStore.getState().showToast(action.text);
        if (action.text.includes('WARNING')) this.audio.warning();
        break;
      case 'solo':
        this.spawnEnemy(action.enemy, action.x, action.z ?? -this.viewH / 2 - 2);
        break;
      case 'eggRain':
        for (let i = 0; i < action.count; i++) {
          this.spawnEnemy('egg', randRange(-half + 6, half - 6), randRange(-8, 2));
        }
        this.audio.hatch();
        break;
      case 'miniboss':
        this.spawnEnemy('miniboss', 0, -this.viewH / 2 - 4);
        this.audio.bossRoar();
        useGameStore.getState().showToast('THE IRON DUKE HAS ARRIVED');
        break;
      case 'boss': {
        this.spawnEnemy('boss', 0, -30);
        this.mode = 'boss_intro';
        this.bossIntroT = 0;
        this.bossIntroStart = performance.now() / 1000;
        this.setPhase('playing');
        useGameStore.getState().showToast('THE CHICKEN OVERLORD');
        break;
      }
      case 'formation': {
        const spots = formationSpots(action.pattern, action.count, half);
        for (const [fx, fz] of spots) {
          this.spawnEnemy(action.enemy, fx, fz, { homeX: fx, homeZ: Math.min(fz + 12, 4) });
        }
        break;
      }
    }
  }

  spawnEnemy(kind: EnemyKind, x: number, z: number, init?: Partial<EnemyInit>): Enemy | null {
    const wanted: Record<EnemyKind, Enemy[]> = {
      chicken: this.enemies.filter((e) => e.kind === 'chicken'),
      duck: this.enemies.filter((e) => e.kind === 'duck'),
      rocket: this.enemies.filter((e) => e.kind === 'rocket'),
      egg: this.enemies.filter((e) => e.kind === 'egg'),
      miniboss: this.enemies.filter((e) => e.kind === 'miniboss'),
      boss: this.enemies.filter((e) => e.kind === 'boss'),
    };
    const pool = wanted[kind];
    const e = pool.find((q) => !q.active);
    if (!e) return null;
    e.init(x, z, init);
    return e;
  }

  private getBoss(): ChickenOverlord | null {
    return (this.enemies.find((e) => e.kind === 'boss' && e.active) as ChickenOverlord) ?? null;
  }

  private onBossDefeated(boss: ChickenOverlord): void {
    if (this.mode === 'boss_dead') return;
    boss.beginDeath();
    this.mode = 'boss_dead';
    this.bossDeathT = 0;
    this.bossDeathStart = performance.now() / 1000;
    this.slowMo = 0.35;
    this.slowMoT = 3.4;
    this.score += SCORE.KILL_BOSS;
    this.audio.explosion(true);
    this.shake(1.6);
  }

  /* ---------------------------------------------------------------- */
  /* Combat                                                            */
  /* ---------------------------------------------------------------- */

  private handleCollisions(): void {
    const playerHitR = PLAYER.HIT_RADIUS;

    this.projectiles.forEachActive((p) => {
      const pos = p.group.position;

      if (p.friendly) {
        for (const e of this.enemies) {
          if (!e.active || e.hp <= 0) continue;
          if (p.hitSet.has(this.enemies.indexOf(e))) continue;
          const r = e.radius + p.radius;
          if (dist2DSq(pos.x, pos.z, e.group.position.x, e.group.position.z) < r * r) {
            p.hitSet.add(this.enemies.indexOf(e));
            this.hitEnemy(e, p);
            if (p.aoe > 0) {
              this.aoeBlast(pos.x, pos.z, p.aoe, p.damage * 0.65, e);
            }
            if (p.pierce > 0) {
              p.pierce -= 1;
            } else {
              this.projectiles.kill(p);
              return;
            }
          }
        }
      } else {
        // enemy bullet vs player
        if (this.player.alive && this.player.invuln <= 0) {
          const r = playerHitR + p.radius;
          if (dist2DSq(pos.x, pos.z, this.player.x, this.player.z) < r * r) {
            this.projectiles.kill(p);
            this.hurtPlayer(p.damage);
          }
        }
      }
    });

    // enemy bodies vs player (light contact damage)
    if (this.player.alive && this.player.invuln <= 0) {
      for (const e of this.enemies) {
        if (!e.active || e.kind === 'boss') continue;
        const r = playerHitR + e.radius * 0.62;
        if (dist2DSq(e.group.position.x, e.group.position.z, this.player.x, this.player.z) < r * r) {
          this.hurtPlayer(e.contactDamage);
          break;
        }
      }
    }
  }

  private hitEnemy(e: Enemy, p: Projectile): void {
    const effects = this.player.evo.effects;
    const opts: { burn?: number; slow?: number } = {};
    if (p.kind === 'fire' || p.kind === 'nova') opts.burn = 0.55;
    if (p.kind === 'ice' || p.kind === 'lance') opts.slow = 2.6;
    void effects;

    const destroyed = e.takeDamage(p.damage, opts);
    this.audio.hit();

    // impact VFX
    const col =
      p.kind === 'fire' ? 0xff8a3a : p.kind === 'ice' ? 0x7ad8ff : p.kind === 'electric' ? 0xffe23a : p.kind === 'nova' ? 0xffb03a : 0x7ae8ff;
    this.particles.burst(p.group.position.x, 0.8, p.group.position.z, {
      count: 5,
      speed: 6.5,
      size: 0.32,
      life: 0.32,
      color: new THREE.Color(col),
    });

    // electric chain lightning
    if (p.kind === 'electric' || p.kind === 'nova') {
      const chains = p.kind === 'nova' ? 3 : 2;
      let chained = 0;
      for (const other of this.enemies) {
        if (chained >= chains) break;
        if (!other.active || other === e || other.hp <= 0) continue;
        const d2 = dist2DSq(e.group.position.x, e.group.position.z, other.group.position.x, other.group.position.z);
        if (d2 < 64) {
          this.particles.lightning(
            e.group.position.x,
            1.1,
            e.group.position.z,
            other.group.position.x,
            1.1,
            other.group.position.z,
            new THREE.Color(p.kind === 'nova' ? 0xffc23a : 0xffe23a),
          );
          other.takeDamage(p.damage * 0.55, { burn: opts.burn });
          chained++;
        }
      }
    }

    // lance beam trail
    if (p.kind === 'lance') {
      this.particles.beam(
        p.group.position.x - Math.cos(p.group.rotation.y) * 0.5,
        0.8,
        p.group.position.z + Math.sin(p.group.rotation.y) * 0.5,
        Math.atan2(-p.vz, p.vx),
        14,
        1.15,
        new THREE.Color(0x66d9ff),
        0.22,
      );
    }

    if (destroyed) {
      // actual removal happens via hp<=0 polling; add immediate punch
      this.hitStop(0.03);
    }
  }

  private aoeBlast(x: number, z: number, radius: number, damage: number, exclude: Enemy): void {
    this.particles.explosion(x, 1, z, 0.85, {
      hot: new THREE.Color(0xffe9b0),
      warm: new THREE.Color(0xff9a2a),
      smoke: new THREE.Color(0x3a2418),
    });
    for (const other of this.enemies) {
      if (!other.active || other === exclude || other.hp <= 0) continue;
      if (dist2DSq(x, z, other.group.position.x, other.group.position.z) < radius * radius) {
        other.takeDamage(damage, { burn: 0.4 });
      }
    }
    this.shake(0.22);
  }

  private hurtPlayer(damage: number): void {
    const ok = this.player.takeDamage(damage);
    if (!ok) return;
    this.audio.damage();
    this.shake(0.75);
    this.hitStop(0.07);
    const p = this.player.group.position;
    this.particles.burst(p.x, 0.9, p.z, {
      count: 18,
      speed: 11,
      size: 0.5,
      life: 0.55,
      color: new THREE.Color(0xff5a5a),
      color2: new THREE.Color(0xffb060),
    });
    this.particles.flash(p.x, 1, p.z, 4, new THREE.Color(0xff5a5a), 0.22);
    useGameStore.getState().showToast(this.player.hp > 0 ? 'HULL DAMAGED' : 'SHIP DESTROYED');
  }

  triggerMegaBurst(): void {
    const result = this.player.megaBurst(this.particles, this.projectiles);
    if (!result) return;
    this.hitStop(0.11);
    this.slowMo = 0.55;
    this.slowMoT = 0.75;
    for (const e of this.enemies) {
      if (!e.active || e.hp <= 0) continue;
      const d2 = dist2DSq(this.player.x, this.player.z, e.group.position.x, e.group.position.z);
      if (d2 < result.radius * result.radius) {
        const destroyed = e.takeDamage(result.damage * (1 + this.player.evoLevel * 0.22));
        this.particles.lightning(
          this.player.x,
          1.2,
          this.player.z,
          e.group.position.x,
          1.2,
          e.group.position.z,
          new THREE.Color(0x8ae8ff),
          0.3,
        );
        if (destroyed && e.kind !== 'boss') {
          // kill flow will pick it up via hp<=0 poll
        }
      }
    }
  }

  private killEnemy(e: Enemy): void {
    e.despawn();
    const pos = e.group.position;
    const scale = e.kind === 'miniboss' ? 2.6 : e.kind === 'duck' ? 1.5 : e.kind === 'egg' ? 1.25 : 1;
    const palette =
      e.kind === 'egg'
        ? { hot: new THREE.Color(0xffb0e8), warm: new THREE.Color(0xb04aff), smoke: new THREE.Color(0x2a1440) }
        : e.kind === 'duck' || e.kind === 'miniboss'
          ? { hot: new THREE.Color(0xfff2c0), warm: new THREE.Color(0xff9a3a), smoke: new THREE.Color(0x2a2438) }
          : undefined;
    this.particles.explosion(pos.x, 1.1, pos.z, scale, palette);
    this.audio.explosion(e.kind === 'miniboss');
    this.shake(e.kind === 'miniboss' ? 1.1 : 0.3);

    const gained = Math.round(KIND_SCORE[e.kind] * (1 + (this.player.evoLevel - 1) * 0.1));
    this.score += gained;
    this.player.megaEnergy = Math.min(PLAYER.MEGA_MAX, this.player.megaEnergy + PLAYER.MEGA_KILL_GAIN);
    this.addFloater(pos.x, pos.z, `+${gained}`, '#ffe23a');

    // DNA drops
    const table = DNA_DROP_TABLE[e.kind];
    if (Math.random() < table.chance) {
      const count = randRange(table.count[0], table.count[1] + 0.999) | 0;
      const kinds: DNAKind[] = ['fire', 'plasma', 'ice', 'electric'];
      for (let i = 0; i < count; i++) {
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        this.pickUps.spawn(kind, pos.x, pos.z, true);
      }
    }
    // rare health drop when hurt
    if (this.player.hp < PLAYER.MAX_HP && Math.random() < 0.055) {
      this.pickUps.spawn('health', pos.x, pos.z, true);
    }
    if (e.kind === 'egg') {
      useGameStore.getState().showToast('EGG DESTROYED');
    }
    if (e.kind === 'miniboss') {
      useGameStore.getState().showToast('THE IRON DUKE IS DOWN!');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Camera, shake, floaters, HUD                                      */
  /* ---------------------------------------------------------------- */

  private updateCamera(dt: number): void {
    // subtle follow
    const targetX = this.player.x * 0.14;
    const targetZ = this.player.z * 0.1;
    const follow = this.mode === 'menu' ? 0 : 1 - Math.exp(-2.2 * dt);
    this.camX += (targetX - this.camX) * follow;
    this.camZ += (targetZ - this.camZ) * follow;

    let ox = 0;
    let oz = 0;
    if (this.settings.screenShake && this.trauma > 0.001) {
      const t = this.trauma * this.trauma;
      ox = (Math.random() - 0.5) * t * 2.4;
      oz = (Math.random() - 0.5) * t * 2.4;
      this.trauma = Math.max(0, this.trauma - dt * 1.65);
    } else {
      this.trauma = Math.max(0, this.trauma - dt * 1.65);
    }
    this.camera.position.set(this.camX + ox, 34, this.camZ + oz);
  }

  private shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  private hitStop(t: number): void {
    this.hitStopT = Math.max(this.hitStopT, t);
  }

  addFloater(x: number, z: number, text: string, color: string): void {
    const wrap = this.floaterWrap;
    if (!wrap) return;
    const v = new THREE.Vector3(x, 1, z).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const px = ((v.x + 1) / 2) * rect.width;
    const py = ((-v.y + 1) / 2) * rect.height;
    const el = this.floaterPool.pop() ?? document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    el.style.color = color;
    el.style.animation = 'none';
    // restart animation
    void el.offsetWidth;
    el.style.animation = 'floater-up 1.1s ease-out forwards';
    wrap.appendChild(el);
    window.setTimeout(() => {
      el.remove();
      if (this.floaterPool.length < 24) this.floaterPool.push(el);
    }, 1150);
  }

  private pushHUD(force = false): void {
    this.hudTimer -= 1;
    if (this.hudTimer > 0 && !force) return;
    this.hudTimer = 6;
    const boss = this.enemies.find((e) => e.active && (e.kind === 'boss' || e.kind === 'miniboss'));
    const store = useGameStore.getState();
    store.setHud({
      hp: this.player.hp,
      maxHp: PLAYER.MAX_HP,
      score: this.score,
      stage: this.stageIndex + 1,
      stageName: STAGES[this.stageIndex].name,
      evoLevel: this.player.evoLevel,
      evoProgress: this.player.progress,
      dna: { ...this.player.evo.dna },
      megaEnergy: this.player.megaEnergy,
      activeEffects: [...this.player.evo.effects],
      activeCombo: this.player.evo.combo,
      bossActive: !!boss,
      bossHp: boss ? boss.hp : 0,
      bossMaxHp: boss ? boss.maxHp : 1,
      bossPhase: boss && boss.kind === 'boss' ? (boss as ChickenOverlord).phase : 0,
      bossName: boss ? (boss.kind === 'boss' ? 'THE CHICKEN OVERLORD' : 'IRON DUKE') : '',
      bestScore: Math.max(loadBestScore(), this.score),
      stageTime: this.director.elapsed,
      fps: this.fpsValue,
    });
  }

  /* ---------------------------------------------------------------- */
  /* QA / debug hooks                                                  */
  /* ---------------------------------------------------------------- */

  debug = {
    god: false,
    addDNA: (kind: DNAKind, n = 5) => {
      for (let i = 0; i < n; i++) this.player.collectDNA(kind, 1);
    },
    maxEvolve: () => {
      for (const k of ['fire', 'plasma', 'ice', 'electric'] as DNAKind[]) {
        for (let i = 0; i < 8; i++) this.player.collectDNA(k, 1);
      }
    },
    setStage: (i: number) => this.beginStage(clamp(i, 0, 2)),
    spawn: (kind: EnemyKind, x = 0, z = -8) => this.spawnEnemy(kind, x, z),
    spawnBoss: () => {
      this.spawnEnemy('boss', 0, -8);
      const b = this.getBoss();
      if (b) b.init(0, -8);
      this.mode = 'playing';
      this.setPhase('playing');
    },
    stage: () => this.stageIndex,
    killBoss: () => {
      const b = this.getBoss();
      if (b) b.hp = 0;
    },
    hurt: (n = 1) => {
      for (let i = 0; i < n; i++) {
        this.player.invuln = 0;
        this.hurtPlayer(1);
      }
    },
    killPlayer: () => {
      this.player.hp = 0;
      this.player.alive = false;
    },
    killAll: () => {
      for (const e of this.enemies) if (e.active && e.kind !== 'boss') this.killEnemy(e);
    },
    skipTransition: () => {
      if (this.mode === 'transition') {
        this.stageTransitionT = 0;
      }
    },
    clearInvuln: () => {
      this.player.invuln = 0;
    },
    /** Fast-forward the current stage: complete the timeline and clear the field. */
    finishStage: () => {
      const def = STAGES[this.stageIndex];
      // jump the director past its timeline by replaying spawn actions instantly as skipped
      while (!this.director.timelineDone) {
        // drain remaining actions without executing spawns
        (this.director as unknown as { actionIndex: number }).actionIndex = def.actions.length;
      }
      for (const e of this.enemies) if (e.active && e.kind !== 'boss') e.despawn();
      this.projectiles.clear('all');
    },
    state: () => ({
      mode: this.mode,
      score: this.score,
      hp: this.player.hp,
      evo: { ...this.player.evo.dna },
      level: this.player.evoLevel,
      enemies: this.enemies.filter((e) => e.active).length,
      bullets: this.projectiles.countActive(),
      fps: this.fpsValue,
    }),
  };
}

/** Compute spawn spots for wave formations. */
function formationSpots(pattern: 'vee' | 'line' | 'column' | 'flanks', count: number, halfW: number): [number, number][] {
  const spots: [number, number][] = [];
  const top = -WORLD.VIEW_HEIGHT / 2 - 3;
  switch (pattern) {
    case 'vee': {
      for (let i = 0; i < count; i++) {
        const off = i - (count - 1) / 2;
        spots.push([off * 3.4, top - Math.abs(off) * 2.6]);
      }
      break;
    }
    case 'line': {
      const spacing = Math.min(3.6, (halfW * 1.6) / count);
      for (let i = 0; i < count; i++) {
        const off = i - (count - 1) / 2;
        spots.push([off * spacing, top]);
      }
      break;
    }
    case 'column': {
      const x = (Math.random() < 0.5 ? -1 : 1) * halfW * 0.55;
      for (let i = 0; i < count; i++) {
        spots.push([x, top - i * 3.2]);
      }
      break;
    }
    case 'flanks': {
      const left = Math.ceil(count / 2);
      for (let i = 0; i < count; i++) {
        const side = i < left ? -1 : 1;
        const idx = i < left ? i : i - left;
        spots.push([side * (halfW * 0.62 + idx * 1.2), top - idx * 2.4]);
      }
      break;
    }
  }
  return spots;
}
