/**
 * Enemy behaviors: Space Chicken, Armored Duck, Rocket Chicken, Alien Egg,
 * the Iron Duke mini-boss and the Chicken Overlord final boss.
 */
import * as THREE from 'three';
import {
  buildAlienEgg,
  buildArmoredDuck,
  buildChickenOverlord,
  buildMiniBoss,
  buildRocketChicken,
  buildSpaceChicken,
  type BossModel,
  type ChickenModel,
  type DuckModel,
  type EggModel,
  type MiniBossModel,
  type RocketChickenModel,
} from './models';
import type { FireOpts, Projectiles } from './Projectiles';
import type { Particles } from './Particles';
import type { EnemyKind } from './types';
import { angleTo, clamp, damp, randRange } from './utils';

export interface EnemyContext {
  time: number;
  dt: number;
  playerX: number;
  playerZ: number;
  playerAlive: boolean;
  particles: Particles;
  projectiles: Projectiles;
  fire(opts: FireOpts): void;
  spawnEnemy(kind: EnemyKind, x: number, z: number, opts?: Partial<EnemyInit>): Enemy | null;
  damagePlayerIfNear(x: number, z: number, radius: number, damage: number): void;
  shake(amount: number): void;
}

export interface EnemyInit {
  hp: number;
  homeX: number;
  homeZ: number;
  phase: number;
}

export interface Enemy {
  readonly kind: EnemyKind;
  readonly group: THREE.Group;
  readonly radius: number;
  readonly score: number;
  hp: number;
  maxHp: number;
  active: boolean;
  hatched: boolean;
  slowTimer: number;
  burnTimer: number;
  burnDps: number;
  contactDamage: number;
  init(x: number, z: number, init?: Partial<EnemyInit>): void;
  update(ctx: EnemyContext): void;
  takeDamage(dmg: number, opts?: { burn?: number; slow?: number }): boolean;
  /** Called when the enemy is removed without player kill (hatch/despawn). */
  despawn(): void;
}

/* ------------------------------------------------------------------ */
/* Shared mixin helpers                                                 */
/* ------------------------------------------------------------------ */

interface DamageableState {
  hitFlash: number;
  mats: THREE.MeshStandardMaterial[];
  baseEmissive: number[];
}

function applyFlash(st: DamageableState, dt: number): void {
  if (st.hitFlash <= 0) return;
  st.hitFlash = Math.max(0, st.hitFlash - dt * 6);
  const f = st.hitFlash * st.hitFlash;
  st.mats.forEach((m, i) => {
    if (m.emissive) m.emissiveIntensity = st.baseEmissive[i] + f * 4.2;
  });
}

function recordMats(mats: THREE.MeshStandardMaterial[]): DamageableState {
  return {
    hitFlash: 0,
    mats,
    baseEmissive: mats.map((m) => m.emissiveIntensity ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/* SPACE CHICKEN                                                        */
/* ------------------------------------------------------------------ */

export class SpaceChicken implements Enemy {
  readonly kind = 'chicken' as const;
  readonly group: THREE.Group;
  readonly radius = 1.35;
  readonly score = 100;
  hp = 3;
  maxHp = 3;
  active = false;
  hatched = false;
  slowTimer = 0;
  burnTimer = 0;
  burnDps = 0;
  contactDamage = 1;

  private model: ChickenModel;
  private dmg: DamageableState;
  private homeX = 0;
  private homeZ = -10;
  private age = 0;
  private phase = 0;
  private shootTimer = randRange(1.6, 3.4);
  private canShoot: boolean;

  constructor(alien = true, canShoot = true) {
    this.model = buildSpaceChicken(alien);
    this.group = this.model.group;
    this.group.visible = false;
    this.dmg = recordMats(this.model.mats);
    this.canShoot = canShoot;
    this.hp = this.maxHp = alien ? 3 : 2;
  }

  init(x: number, z: number, init?: Partial<EnemyInit>): void {
    this.group.visible = true;
    this.active = true;
    this.hatched = false;
    this.hp = this.maxHp = init?.hp ?? this.maxHp;
    this.group.position.set(x, 0, z);
    this.homeX = init?.homeX ?? x;
    this.homeZ = init?.homeZ ?? Math.max(z, -12 + Math.random() * 6);
    this.age = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.shootTimer = randRange(1.4, 3.2);
    this.slowTimer = 0;
    this.burnTimer = 0;
    this.dmg.hitFlash = 0;
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(1);
  }

  update(ctx: EnemyContext): void {
    if (!this.active) return;
    this.age += ctx.dt;
    applyFlash(this.dmg, ctx.dt);
    const slow = this.slowTimer > 0 ? 0.52 : 1;
    this.slowTimer = Math.max(0, this.slowTimer - ctx.dt);
    if (this.burnTimer > 0) {
      this.burnTimer -= ctx.dt;
      this.hp -= this.burnDps * ctx.dt;
      if (Math.random() < 0.3) {
        const p = this.group.position;
        ctx.particles.spawn(p.x + randRange(-0.7, 0.7), randRange(0.4, 1.4), p.z + randRange(-0.7, 0.7), 0, randRange(1, 2.6), 0, new THREE.Color(0xff7a2a), 0.85, 0.34, 0.5, 1.6);
      }
    }

    const t = this.age;
    // entry -> hover -> slow descent
    const targetZ = this.homeZ + Math.max(0, t - 2.2) * 1.35 * slow;
    const wx = this.homeX + Math.sin(t * 1.15 + this.phase) * 2.1;
    const p = this.group.position;
    p.x = damp(p.x, wx, 2.6, ctx.dt);
    p.z = damp(p.z, targetZ, 1.8, ctx.dt);
    p.y = Math.sin(t * 2.2 + this.phase) * 0.28;
    // face movement
    this.group.rotation.y = damp(this.group.rotation.y, clamp((wx - p.x) * 0.14, -0.5, 0.5), 6, ctx.dt);

    // wing flap + head bob + tail sway
    const flap = Math.sin(t * 9 + this.phase) * 0.42;
    this.model.wings[0].rotation.z = flap;
    this.model.wings[1].rotation.z = -flap;
    this.model.head.position.y = 1.08 + Math.sin(t * 4.4 + this.phase) * 0.07;
    this.model.tail.rotation.y = Math.sin(t * 3 + this.phase) * 0.18;

    // shooting
    if (this.canShoot && ctx.playerAlive && t > 1.4 && this.group.position.z < 20) {
      this.shootTimer -= ctx.dt * slow;
      if (this.shootTimer <= 0) {
        this.shootTimer = randRange(2.2, 4.2);
        const a = angleTo(p.x, p.z, ctx.playerX, ctx.playerZ) + randRange(-0.12, 0.12);
        ctx.fire({
          kind: 'enemy',
          x: p.x,
          y: 0.8,
          z: p.z - 1.1,
          angle: a,
          speed: 17,
          damage: 1,
          friendly: false,
          life: 4.2,
        });
        ctx.particles.flash(p.x, 1.0, p.z - 1.1, 0.9, new THREE.Color(0xff6a3a), 0.1);
      }
    }
  }

  takeDamage(dmg: number, opts?: { burn?: number; slow?: number }): boolean {
    if (!this.active) return true;
    this.hp -= dmg;
    this.dmg.hitFlash = 1;
    if (opts?.burn) {
      this.burnTimer = Math.max(this.burnTimer, 2.4);
      this.burnDps = Math.max(this.burnDps, opts.burn);
    }
    if (opts?.slow) this.slowTimer = Math.max(this.slowTimer, opts.slow);
    return this.hp <= 0;
  }

  despawn(): void {
    this.active = false;
    this.group.visible = false;
    this.burnDps = 0;
    this.burnTimer = 0;
  }
}

/* ------------------------------------------------------------------ */
/* ARMORED DUCK                                                         */
/* ------------------------------------------------------------------ */

export class ArmoredDuck implements Enemy {
  readonly kind = 'duck' as const;
  readonly group: THREE.Group;
  readonly radius = 1.95;
  readonly score = 260;
  hp = 13;
  maxHp = 13;
  active = false;
  hatched = false;
  slowTimer = 0;
  burnTimer = 0;
  burnDps = 0;
  contactDamage = 1;

  private model: DuckModel;
  private dmg: DamageableState;
  private homeX = 0;
  private homeZ = -8;
  private age = 0;
  private phase = 0;
  private shootTimer = 2.2;
  private armorStage = 0;

  constructor(scale = 1) {
    this.model = buildArmoredDuck(scale);
    this.group = this.model.group;
    this.group.visible = false;
    this.dmg = recordMats(this.model.mats);
  }

  init(x: number, z: number, init?: Partial<EnemyInit>): void {
    this.group.visible = true;
    this.active = true;
    this.hp = this.maxHp = init?.hp ?? 13;
    this.group.position.set(x, 0, z);
    this.homeX = init?.homeX ?? x;
    this.homeZ = init?.homeZ ?? randRange(-6, -1);
    this.age = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.shootTimer = 2.2;
    this.armorStage = 0;
    this.slowTimer = 0;
    this.burnTimer = 0;
    this.dmg.hitFlash = 0;
    for (const plate of this.model.plates) plate.visible = true;
  }

  update(ctx: EnemyContext): void {
    if (!this.active) return;
    this.age += ctx.dt;
    applyFlash(this.dmg, ctx.dt);
    const slow = this.slowTimer > 0 ? 0.55 : 1;
    this.slowTimer = Math.max(0, this.slowTimer - ctx.dt);
    if (this.burnTimer > 0) {
      this.burnTimer -= ctx.dt;
      this.hp -= this.burnDps * ctx.dt;
    }

    const t = this.age;
    const targetZ = this.homeZ + Math.max(0, t - 3) * 0.62 * slow;
    const wx = this.homeX + Math.sin(t * 0.6 + this.phase) * 1.35;
    const p = this.group.position;
    p.x = damp(p.x, wx, 1.6, ctx.dt);
    p.z = damp(p.z, targetZ, 1.15, ctx.dt);
    p.y = Math.sin(t * 1.7 + this.phase) * 0.16;

    // armor break stages
    const hpFrac = this.hp / this.maxHp;
    const stage = hpFrac < 0.34 ? 2 : hpFrac < 0.67 ? 1 : 0;
    if (stage > this.armorStage) {
      this.armorStage = stage;
      const plate = this.model.plates[stage % this.model.plates.length];
      if (plate) {
        plate.visible = false;
        const wp = new THREE.Vector3();
        plate.getWorldPosition(wp);
        ctx.particles.burst(wp.x, wp.y, wp.z, {
          count: 14,
          speed: 9,
          size: 0.5,
          life: 0.8,
          color: new THREE.Color(0xffd08a),
          color2: new THREE.Color(0x8a97b8),
          gravity: -6,
        });
        ctx.particles.flash(wp.x, wp.y, wp.z, 2.2, new THREE.Color(0xffc23a), 0.18);
      }
    }

    // spread shots
    this.shootTimer -= ctx.dt * slow;
    if (this.shootTimer <= 0 && ctx.playerAlive) {
      this.shootTimer = randRange(2.6, 3.6);
      const base = angleTo(p.x, p.z, ctx.playerX, ctx.playerZ);
      for (let i = -1; i <= 1; i++) {
        ctx.fire({
          kind: i === 0 ? 'enemyBig' : 'enemy',
          x: p.x,
          y: 0.9,
          z: p.z - 1.6,
          angle: base + i * 0.26,
          speed: 15.5,
          damage: 1,
          friendly: false,
          life: 4.5,
        });
      }
      ctx.particles.flash(p.x, 1.1, p.z - 1.7, 1.6, new THREE.Color(0xb02aff), 0.14);
    }
  }

  takeDamage(dmg: number, opts?: { burn?: number; slow?: number }): boolean {
    if (!this.active) return true;
    this.hp -= dmg;
    this.dmg.hitFlash = 0.85;
    if (opts?.burn) {
      this.burnTimer = Math.max(this.burnTimer, 2.4);
      this.burnDps = Math.max(this.burnDps, opts.burn * 0.7);
    }
    if (opts?.slow) this.slowTimer = Math.max(this.slowTimer, opts.slow);
    return this.hp <= 0;
  }

  despawn(): void {
    this.active = false;
    this.group.visible = false;
  }
}

/* ------------------------------------------------------------------ */
/* ROCKET CHICKEN                                                       */
/* ------------------------------------------------------------------ */

export class RocketChicken implements Enemy {
  readonly kind = 'rocket' as const;
  readonly group: THREE.Group;
  readonly radius = 1.25;
  readonly score = 180;
  hp = 5;
  maxHp = 5;
  active = false;
  hatched = false;
  slowTimer = 0;
  burnTimer = 0;
  burnDps = 0;
  contactDamage = 1;

  private model: RocketChickenModel;
  private dmg: DamageableState;
  private age = 0;
  private state: 'entry' | 'telegraph' | 'charge' = 'entry';
  private chargeDX = 0;
  private chargeDZ = 1;
  private chargeSpeed = 46;
  private exploded = false;

  constructor() {
    this.model = buildRocketChicken();
    this.group = this.model.group;
    this.group.visible = false;
    this.dmg = recordMats(this.model.mats);
  }

  init(x: number, z: number, init?: Partial<EnemyInit>): void {
    this.group.visible = true;
    this.active = true;
    this.hp = this.maxHp = init?.hp ?? 5;
    this.group.position.set(x, 0, z);
    this.age = 0;
    this.state = 'entry';
    this.exploded = false;
    this.slowTimer = 0;
    this.burnTimer = 0;
    this.dmg.hitFlash = 0;
    this.model.flame.scale.setScalar(1);
  }

  update(ctx: EnemyContext): void {
    if (!this.active) return;
    this.age += ctx.dt;
    applyFlash(this.dmg, ctx.dt);
    const slow = this.slowTimer > 0 ? 0.6 : 1;
    this.slowTimer = Math.max(0, this.slowTimer - ctx.dt);
    if (this.burnTimer > 0) {
      this.burnTimer -= ctx.dt;
      this.hp -= this.burnDps * ctx.dt;
    }

    const p = this.group.position;
    const t = this.age;

    if (this.state === 'entry') {
      p.z += 11 * ctx.dt * slow;
      this.model.flame.scale.setScalar(1 + Math.sin(t * 30) * 0.22);
      if (t > 0.95) {
        this.state = 'telegraph';
        this.age = 0;
      }
    } else if (this.state === 'telegraph') {
      // pause, glow, lock on
      p.y = Math.sin(t * 24) * 0.12;
      const a = angleTo(p.x, p.z, ctx.playerX, ctx.playerZ);
      this.group.rotation.y = damp(this.group.rotation.y, -a + Math.PI, 7, ctx.dt);
      this.chargeDX = Math.cos(a);
      this.chargeDZ = -Math.sin(a);
      if (Math.random() < 0.55) {
        ctx.particles.spawn(p.x + randRange(-0.6, 0.6), 0.6, p.z + randRange(-0.6, 0.6), 0, randRange(1.5, 3.2), 0, new THREE.Color(0xff5a2a), 0.9, 0.42, 0.32, 1.2);
      }
      if (t > 0.72) {
        this.state = 'charge';
        this.age = 0;
        this.model.flame.scale.setScalar(2.1);
        ctx.particles.flash(p.x, 0.8, p.z, 2.6, new THREE.Color(0xff9a3a), 0.16);
      }
    } else {
      const sp = this.chargeSpeed * slow;
      p.x += this.chargeDX * sp * ctx.dt;
      p.z += this.chargeDZ * sp * ctx.dt;
      p.y = 0;
      this.group.rotation.y = damp(this.group.rotation.y, -Math.atan2(this.chargeDZ, this.chargeDX) + Math.PI, 9, ctx.dt);
      this.model.flame.scale.setScalar(2.2 + Math.sin(t * 38) * 0.4);
      ctx.particles.trail(p.x, 0.6, p.z, new THREE.Color(0xff8a3a), 0.85, 0.95);
      ctx.particles.trail(p.x, 0.6, p.z, new THREE.Color(0xffd08a), 0.45, 0.8);
      ctx.damagePlayerIfNear(p.x, p.z, this.radius + 1.1, 1);
      if (Math.abs(p.x) > 34 || Math.abs(p.z) > 30 || t > 2.6) {
        this.detonate(ctx);
      }
    }
  }

  private detonate(ctx: EnemyContext): void {
    if (this.exploded) return;
    this.exploded = true;
    const p = this.group.position;
    ctx.particles.explosion(p.x, 1.1, p.z, 1.35, {
      hot: new THREE.Color(0xffe2b0),
      warm: new THREE.Color(0xff7a2a),
      smoke: new THREE.Color(0x402018),
    });
    ctx.damagePlayerIfNear(p.x, p.z, 3.6, 1);
    ctx.shake(0.55);
    this.hp = 0;
  }

  takeDamage(dmg: number, opts?: { burn?: number; slow?: number }): boolean {
    if (!this.active) return true;
    this.hp -= dmg;
    this.dmg.hitFlash = 1;
    if (opts?.burn) {
      this.burnTimer = Math.max(this.burnTimer, 2);
      this.burnDps = Math.max(this.burnDps, opts.burn);
    }
    if (opts?.slow) this.slowTimer = Math.max(this.slowTimer, opts.slow);
    return this.hp <= 0;
  }

  despawn(): void {
    this.active = false;
    this.group.visible = false;
  }
}

/* ------------------------------------------------------------------ */
/* ALIEN EGG — the hatching mechanic                                    */
/* ------------------------------------------------------------------ */

export type EggHatchResult = 'chicken' | 'rocket' | 'duo';

export class AlienEgg implements Enemy {
  readonly kind = 'egg' as const;
  readonly group: THREE.Group;
  readonly radius = 1.55;
  readonly score = 140;
  hp = 6;
  maxHp = 6;
  active = false;
  hatched = false;
  slowTimer = 0;
  burnTimer = 0;
  burnDps = 0;
  contactDamage = 1;

  /** seconds until hatch */
  hatchTime = 13;
  private model: EggModel;
  private dmg: DamageableState;
  private age = 0;
  private hatchInto: EggHatchResult = 'chicken';

  constructor() {
    this.model = buildAlienEgg();
    this.group = this.model.group;
    this.group.visible = false;
    this.dmg = recordMats(this.model.mats);
  }

  init(x: number, z: number, init?: Partial<EnemyInit>): void {
    this.group.visible = true;
    this.active = true;
    this.hatched = false;
    this.hp = this.maxHp = init?.hp ?? 6;
    this.group.position.set(x, 0, z);
    this.age = 0;
    this.hatchTime = randRange(11, 15);
    this.hatchInto = (['chicken', 'rocket', 'duo'] as EggHatchResult[])[Math.floor(Math.random() * 3)];
    this.slowTimer = 0;
    this.burnTimer = 0;
    this.dmg.hitFlash = 0;
  }

  get timeLeft(): number {
    return Math.max(0, this.hatchTime - this.age);
  }

  update(ctx: EnemyContext): void {
    if (!this.active) return;
    this.age += ctx.dt;
    applyFlash(this.dmg, ctx.dt);
    const p = this.group.position;
    const left = this.timeLeft;
    const urgency = 1 - left / this.hatchTime; // 0..1

    if (this.burnTimer > 0) {
      this.burnTimer -= ctx.dt;
      this.hp -= this.burnDps * ctx.dt;
    }

    // hover + growing agitation
    p.y = Math.sin(this.age * (2 + urgency * 6)) * (0.12 + urgency * 0.22);
    const shakeAmt = urgency > 0.55 ? (urgency - 0.55) * 0.34 : 0;
    p.x += Math.sin(this.age * 31) * shakeAmt * ctx.dt * 2.2;
    const pulse = 1 + Math.sin(this.age * (3 + urgency * 9)) * (0.035 + urgency * 0.075);
    this.model.shell.scale.setScalar(pulse);
    // cracks glow + aura with urgency
    const crackGlow = 1.4 + urgency * 3.4;
    for (const c of this.model.cracks) {
      const m = c.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = crackGlow;
    }
    const auraMat = this.model.aura.material as THREE.MeshBasicMaterial;
    auraMat.opacity = 0.1 + urgency * 0.3;
    auraMat.color.setHex(urgency > 0.62 ? 0xff4a2a : 0xb04aff);
    this.model.aura.scale.setScalar(1 + urgency * 0.22 + Math.sin(this.age * (5 + urgency * 8)) * 0.05);

    // hatch!
    if (left <= 0) {
      this.hatched = true;
      ctx.particles.explosion(p.x, 1.1, p.z, 1.05, {
        hot: new THREE.Color(0xffb0e8),
        warm: new THREE.Color(0xb04aff),
        smoke: new THREE.Color(0x2a1440),
      });
      ctx.shake(0.32);
      if (this.hatchInto === 'chicken' || this.hatchInto === 'duo') {
        ctx.spawnEnemy('chicken', p.x - (this.hatchInto === 'duo' ? 1.2 : 0), p.z, { homeX: p.x, homeZ: Math.max(p.z, -6) });
      }
      if (this.hatchInto === 'rocket' || this.hatchInto === 'duo') {
        ctx.spawnEnemy('rocket', p.x + (this.hatchInto === 'duo' ? 1.2 : 0), p.z, {});
      }
      this.hp = 0;
    }
  }

  takeDamage(dmg: number, opts?: { burn?: number; slow?: number }): boolean {
    if (!this.active) return true;
    this.hp -= dmg;
    this.dmg.hitFlash = 1;
    if (opts?.burn) {
      this.burnTimer = Math.max(this.burnTimer, 2.4);
      this.burnDps = Math.max(this.burnDps, opts.burn);
    }
    if (opts?.slow) this.slowTimer = Math.max(this.slowTimer, opts.slow);
    return this.hp <= 0;
  }

  despawn(): void {
    this.active = false;
    this.group.visible = false;
  }
}

/* ------------------------------------------------------------------ */
/* MINI-BOSS: IRON DUKE                                                 */
/* ------------------------------------------------------------------ */

export class MiniBoss implements Enemy {
  readonly kind = 'miniboss' as const;
  readonly group: THREE.Group;
  readonly radius = 3.6;
  readonly score = 1500;
  hp = 220;
  maxHp = 220;
  active = false;
  hatched = false;
  slowTimer = 0;
  burnTimer = 0;
  burnDps = 0;
  contactDamage = 1;

  private model: MiniBossModel;
  private dmg: DamageableState;
  private age = 0;
  private homeX = 0;
  private shootA = 1.8;
  private shootB = 5.2;
  private shootC = 8.5;

  constructor() {
    this.model = buildMiniBoss();
    this.group = this.model.group;
    this.group.visible = false;
    this.dmg = recordMats(this.model.mats);
  }

  init(x: number, z: number, init?: Partial<EnemyInit>): void {
    this.group.visible = true;
    this.active = true;
    this.hp = this.maxHp = init?.hp ?? 220;
    this.group.position.set(x, 0, z);
    this.homeX = x;
    this.age = 0;
    this.shootA = 1.8;
    this.shootB = 5.2;
    this.shootC = 8.5;
    this.dmg.hitFlash = 0;
    for (const plate of this.model.duck.plates) plate.visible = true;
  }

  update(ctx: EnemyContext): void {
    if (!this.active) return;
    this.age += ctx.dt;
    applyFlash(this.dmg, ctx.dt);
    const slow = this.slowTimer > 0 ? 0.7 : 1;
    this.slowTimer = Math.max(0, this.slowTimer - ctx.dt);
    if (this.burnTimer > 0) {
      this.burnTimer -= ctx.dt;
      this.hp -= this.burnDps * ctx.dt;
    }

    const p = this.group.position;
    const t = this.age;
    // hover in and strafe
    const targetZ = -5.5 + Math.sin(t * 0.42) * 2.2;
    p.x = damp(p.x, this.homeX + Math.sin(t * 0.55) * 7.2, 1.4, ctx.dt);
    p.z = damp(p.z, targetZ, 1.2, ctx.dt);
    p.y = Math.sin(t * 1.5) * 0.22;

    // 3-way volley
    this.shootA -= ctx.dt * slow;
    if (this.shootA <= 0 && ctx.playerAlive) {
      this.shootA = 2.1;
      const base = angleTo(p.x, p.z, ctx.playerX, ctx.playerZ);
      for (let i = -2; i <= 2; i++) {
        ctx.fire({ kind: 'enemyBig', x: p.x, y: 1.6, z: p.z - 2.4, angle: base + i * 0.17, speed: 17, damage: 1, friendly: false, life: 5 });
      }
      ctx.particles.flash(p.x, 1.8, p.z - 2.6, 2.6, new THREE.Color(0xff8a2a), 0.16);
      ctx.shake(0.12);
    }
    // radial burst
    this.shootB -= ctx.dt * slow;
    if (this.shootB <= 0) {
      this.shootB = 6.4;
      for (let i = 0; i < 14; i++) {
        ctx.fire({ kind: 'enemy', x: p.x, y: 1.2, z: p.z, angle: (i / 14) * Math.PI * 2, speed: 13.5, damage: 1, friendly: false, life: 6 });
      }
      ctx.particles.ring(p.x, 1.2, p.z, 8, new THREE.Color(0xff6a2a), 0.5);
    }
    // summon
    this.shootC -= ctx.dt * slow;
    if (this.shootC <= 0) {
      this.shootC = 11.5;
      ctx.spawnEnemy('chicken', p.x - 3, p.z + 1, { homeX: p.x - 3, homeZ: p.z + 1 });
      ctx.spawnEnemy('chicken', p.x + 3, p.z + 1, { homeX: p.x + 3, homeZ: p.z + 1 });
      ctx.particles.ring(p.x, 1, p.z, 6, new THREE.Color(0xb04aff), 0.6);
    }
  }

  takeDamage(dmg: number, opts?: { burn?: number; slow?: number }): boolean {
    if (!this.active) return true;
    this.hp -= dmg;
    this.dmg.hitFlash = 0.75;
    if (opts?.burn) {
      this.burnTimer = Math.max(this.burnTimer, 2);
      this.burnDps = Math.max(this.burnDps, opts.burn * 0.4);
    }
    if (opts?.slow) this.slowTimer = Math.max(this.slowTimer, opts.slow * 0.5);
    return this.hp <= 0;
  }

  despawn(): void {
    this.active = false;
    this.group.visible = false;
  }
}

/* ------------------------------------------------------------------ */
/* FINAL BOSS: THE CHICKEN OVERLORD                                     */
/* ------------------------------------------------------------------ */

export class ChickenOverlord implements Enemy {
  readonly kind = 'boss' as const;
  readonly group: THREE.Group;
  readonly radius = 5.2;
  readonly score = 8000;
  hp = 2600;
  maxHp = 2600;
  active = false;
  hatched = false;
  slowTimer = 0;
  burnTimer = 0;
  burnDps = 0;
  contactDamage = 1;
  phase = 1;
  dying = false;

  private model: BossModel;
  private dmg: DamageableState;
  private age = 0;
  private tSpiral = 0;
  private tVolley = 2.2;
  private tRadial = 6.5;
  private tSummon = 9;
  private tEgg = 14;
  private dashCooldown = 18;
  private dashStart = 0;
  private spiralArm = 0;
  private dashState: 'idle' | 'windup' | 'dash' = 'idle';
  private dashDX = 0;
  private dashDZ = 0;

  constructor() {
    this.model = buildChickenOverlord();
    this.group = this.model.group;
    this.group.visible = false;
    this.dmg = recordMats(this.model.mats);
  }

  init(x: number, z: number, init?: Partial<EnemyInit>): void {
    this.group.visible = true;
    this.active = true;
    this.dying = false;
    this.hp = this.maxHp = init?.hp ?? 2600;
    this.group.position.set(x, 0, z);
    this.age = 0;
    this.phase = 1;
    this.tSpiral = 0;
    this.tVolley = 2.2;
    this.tRadial = 6.5;
    this.tSummon = 9;
    this.tEgg = 14;
    this.dashCooldown = 18;
    this.dashState = 'idle';
    this.dmg.hitFlash = 0;
  }

  get phaseIndex(): number {
    return this.phase;
  }

  update(ctx: EnemyContext): void {
    if (!this.active) return;
    if (this.dying) {
      this.updateDeath(ctx);
      return;
    }
    this.age += ctx.dt;
    applyFlash(this.dmg, ctx.dt);

    const frac = this.hp / this.maxHp;
    this.phase = frac > 0.62 ? 1 : frac > 0.3 ? 2 : 3;

    if (this.burnTimer > 0) {
      this.burnTimer -= ctx.dt;
      this.hp -= this.burnDps * ctx.dt;
    }

    const p = this.group.position;
    const t = this.age;
    const speedMul = this.phase === 3 ? 1.55 : this.phase === 2 ? 1.22 : 1;

    // movement: strafe high, dip lower in phase 3
    const baseZ = this.phase === 3 ? -3.2 : -6.4;
    if (this.dashState === 'idle') {
      p.x = damp(p.x, Math.sin(t * 0.42 * speedMul) * 9.5, 1.15, ctx.dt);
      p.z = damp(p.z, baseZ + Math.sin(t * 0.6) * 1.6, 1.1, ctx.dt);
    } else if (this.dashState === 'windup') {
      const a = angleTo(p.x, p.z, ctx.playerX, ctx.playerZ);
      this.dashDX = Math.cos(a);
      this.dashDZ = -Math.sin(a);
      if (Math.random() < 0.7) {
        ctx.particles.spawn(p.x + randRange(-3, 3), randRange(0.5, 3), p.z + randRange(-3, 3), 0, 2, 0, new THREE.Color(0xff2a8a), 0.9, 0.5, 0.35, 1.2);
      }
      if (t - this.dashStart > 0.85) {
        this.dashState = 'dash';
        ctx.shake(0.6);
      }
    } else {
      const sp = 26 * speedMul;
      p.x += this.dashDX * sp * ctx.dt;
      p.z += this.dashDZ * sp * ctx.dt;
      ctx.damagePlayerIfNear(p.x, p.z, this.radius * 0.85, 1);
      ctx.particles.trail(p.x + randRange(-2, 2), 1.5, p.z + randRange(-2, 2), new THREE.Color(0xff2a8a), 1.1, 0.9);
      if (Math.abs(p.x) > 17 || p.z > 6 || p.z < -16 || t - this.dashStart > 2.1) {
        this.dashState = 'idle';
        this.dashCooldown = this.phase === 3 ? 9 : 15;
      }
    }

    // engine flames
    for (const f of this.model.engineFlames) {
      f.scale.setScalar(1 + Math.sin(t * 24 + f.position.x) * 0.18 + (this.phase === 3 ? 0.5 : 0));
    }
    // aura
    const auraMat = this.model.auraMat;
    auraMat.opacity = 0.07 + (this.phase - 1) * 0.05 + Math.sin(t * 3) * 0.022;
    auraMat.color.setHex(this.phase === 3 ? 0xff2a2a : 0xff2a8a);
    // eye glow escalates
    for (const e of this.model.eyes) {
      const m = e.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 2.6 + this.phase * 0.9 + Math.sin(t * 5) * 0.5;
    }

    // ---- attacks ----
    this.tVolley -= ctx.dt * speedMul;
    if (this.tVolley <= 0 && ctx.playerAlive) {
      this.tVolley = this.phase === 3 ? 1.5 : 2.35;
      const base = angleTo(p.x, p.z, ctx.playerX, ctx.playerZ);
      const n = this.phase === 3 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.16;
        ctx.fire({
          kind: 'bossOrb',
          x: p.x + Math.cos(base + Math.PI / 2) * spread * 8,
          y: 2.2,
          z: p.z - Math.sin(base + Math.PI / 2) * spread * 8,
          angle: base + spread,
          speed: this.phase === 3 ? 24 : 19,
          damage: 1,
          friendly: false,
          life: 5.5,
        });
      }
      ctx.particles.flash(p.x, 2.2, p.z - 2, 3.2, new THREE.Color(0xff4a9a), 0.16);
    }

    if (this.phase >= 2) {
      this.tSpiral -= ctx.dt;
      if (this.tSpiral <= 0) {
        this.tSpiral = 0.085;
        const arms = this.phase === 3 ? 4 : 2;
        for (let k = 0; k < arms; k++) {
          const a = this.spiralArm + (k / arms) * Math.PI * 2;
          ctx.fire({ kind: 'enemy', x: p.x, y: 1.6, z: p.z, angle: a, speed: 12.5, damage: 1, friendly: false, life: 6.5 });
        }
        this.spiralArm += this.phase === 3 ? 0.42 : 0.3;
      }
    }

    this.tRadial -= ctx.dt * speedMul;
    if (this.tRadial <= 0) {
      this.tRadial = this.phase === 3 ? 6.2 : 8.2;
      const n = this.phase === 3 ? 22 : 15;
      for (let i = 0; i < n; i++) {
        ctx.fire({ kind: 'enemyBig', x: p.x, y: 1.4, z: p.z, angle: (i / n) * Math.PI * 2, speed: 12, damage: 1, friendly: false, life: 7 });
      }
      ctx.particles.ring(p.x, 1.4, p.z, 12, new THREE.Color(0xff2a8a), 0.6);
      ctx.shake(0.35);
    }

    this.tSummon -= ctx.dt;
    if (this.tSummon <= 0) {
      this.tSummon = this.phase === 3 ? 8.5 : 11.5;
      const kind = this.phase >= 2 ? 'rocket' : 'chicken';
      ctx.spawnEnemy(kind, p.x - 4, p.z + 2, { homeX: p.x - 4, homeZ: -2 });
      ctx.spawnEnemy(kind, p.x + 4, p.z + 2, { homeX: p.x + 4, homeZ: -2 });
      if (this.phase === 3) ctx.spawnEnemy('chicken', p.x, p.z + 3, { homeX: p.x, homeZ: -1 });
      ctx.particles.ring(p.x, 1, p.z, 8, new THREE.Color(0xb04aff), 0.55);
    }

    if (this.phase >= 2) {
      this.tEgg -= ctx.dt;
      if (this.tEgg <= 0) {
        this.tEgg = 15;
        const ex = clamp(p.x + randRange(-6, 6), -12, 12);
        ctx.spawnEnemy('egg', ex, randRange(-4, 4), {});
        ctx.particles.ring(ex, 0.5, 0, 5, new THREE.Color(0xff4ad8), 0.7);
      }
    }

    if (this.phase === 3 && this.dashState === 'idle') {
      this.dashCooldown -= ctx.dt;
      if (this.dashCooldown <= 0) {
        this.dashState = 'windup';
        this.dashStart = this.age;
      }
    }
  }

  private updateDeath(ctx: EnemyContext): void {
    this.age += ctx.dt;
    const p = this.group.position;
    // staggered explosions
    if (Math.random() < 0.3) {
      ctx.particles.explosion(
        p.x + randRange(-4.5, 4.5),
        randRange(1, 4),
        p.z + randRange(-4, 4),
        randRange(0.9, 1.7),
        {
          hot: new THREE.Color(0xfff2c0),
          warm: new THREE.Color(0xff7a2a),
          smoke: new THREE.Color(0x301828),
        },
      );
      ctx.shake(0.4);
    }
    this.group.position.y = -Math.min(3, this.age * 0.35);
    this.group.rotation.z += 0.12 * ctx.dt;
  }

  beginDeath(): void {
    this.dying = true;
    this.age = 0;
    this.burnTimer = 0;
  }

  takeDamage(dmg: number, opts?: { burn?: number; slow?: number }): boolean {
    if (!this.active || this.dying) return false;
    this.hp -= dmg;
    this.dmg.hitFlash = 0.62;
    if (opts?.burn) {
      this.burnTimer = Math.max(this.burnTimer, 1.4);
      this.burnDps = Math.max(this.burnDps, opts.burn * 0.12);
    }
    // boss is immune to slow but flinches slightly
    return this.hp <= 0;
  }

  despawn(): void {
    this.active = false;
    this.group.visible = false;
  }
}
