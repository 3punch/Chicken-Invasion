/**
 * The Living Ship — player controller: movement, autofire, damage/invuln,
 * DNA absorption, evolution visuals and the MEGA BURST ability.
 */
import * as THREE from 'three';
import { DNA_THRESHOLDS, PLAYER } from './constants';
import {
  addDNA,
  createEvolutionState,
  damageMultiplier,
  evoProgress,
  fireRateMultiplier,
  volleySize,
  type EvolutionState,
} from './Evolution';
import { buildLivingShip, setShipEvolution, type LivingShip } from './models';
import { angleTo, clamp, damp } from './utils';
import type { Projectiles } from './Projectiles';
import type { Particles } from './Particles';
import type { DNAKind } from './types';

export interface PlayerBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface FireContext {
  projectiles: Projectiles;
  particles: Particles;
  damageMult: number;
}

export class Player {
  readonly ship: LivingShip;
  readonly group: THREE.Group;
  evo: EvolutionState = createEvolutionState();

  x = 0;
  z = 12;
  vx = 0;
  vz = 0;
  hp: number = PLAYER.MAX_HP;
  invuln = 0;
  alive = true;

  megaEnergy: number = PLAYER.MEGA_MAX; // start ready so players discover it
  megaCooldown = 0;

  private fireTimer = 0;
  private animT = 0;
  private flashTimer = 0;
  private bank = 0;
  onLevelUp: (() => void) | null = null;
  onMegaBurst: (() => void) | null = null;

  constructor() {
    this.ship = buildLivingShip();
    this.group = new THREE.Group();
    this.group.add(this.ship.group);
  }

  reset(): void {
    this.x = 0;
    this.z = 12;
    this.vx = 0;
    this.vz = 0;
    this.hp = PLAYER.MAX_HP as number;
    this.invuln = 1.2;
    this.alive = true;
    this.evo = createEvolutionState();
    this.megaEnergy = PLAYER.MEGA_MAX;
    this.megaCooldown = 0;
    this.fireTimer = 0;
    setShipEvolution(this.ship, 1, this.evo.dna);
    this.group.visible = true;
    this.group.scale.setScalar(1);
  }

  get evoLevel(): number {
    return this.evo.level;
  }

  get progress(): number {
    return evoProgress(this.evo);
  }

  collectDNA(kind: DNAKind, amount = 1): boolean {
    const leveled = addDNA(this.evo, kind, amount);
    setShipEvolution(this.ship, this.evo.level, this.evo.dna);
    this.megaEnergy = Math.min(PLAYER.MEGA_MAX, this.megaEnergy + 8);
    if (leveled && this.onLevelUp) this.onLevelUp();
    return leveled;
  }

  takeDamage(amount = 1): boolean {
    if (this.invuln > 0 || !this.alive) return false;
    this.hp -= amount;
    this.invuln = PLAYER.INVULN_TIME;
    this.flashTimer = 0.35;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return true;
  }

  heal(amount = 1): void {
    this.hp = Math.min(PLAYER.MAX_HP, this.hp + amount);
  }

  update(dt: number, moveX: number, moveZ: number, bounds: PlayerBounds): void {
    this.animT += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.megaCooldown = Math.max(0, this.megaCooldown - dt);
    this.megaEnergy = Math.min(PLAYER.MEGA_MAX, this.megaEnergy + PLAYER.MEGA_REGEN * dt);

    if (this.alive) {
      const ax = moveX * PLAYER.ACCEL;
      const az = moveZ * PLAYER.ACCEL;
      this.vx += ax * dt;
      this.vz += az * dt;
      const drag = Math.exp(-PLAYER.DRAG * dt);
      this.vx *= drag;
      this.vz *= drag;
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > PLAYER.SPEED) {
        this.vx = (this.vx / sp) * PLAYER.SPEED;
        this.vz = (this.vz / sp) * PLAYER.SPEED;
      }
      this.x = clamp(this.x + this.vx * dt, bounds.minX, bounds.maxX);
      this.z = clamp(this.z + this.vz * dt, bounds.minZ, bounds.maxZ);
      if ((this.x === bounds.minX && this.vx < 0) || (this.x === bounds.maxX && this.vx > 0)) this.vx = 0;
      if ((this.z === bounds.minZ && this.vz < 0) || (this.z === bounds.maxZ && this.vz > 0)) this.vz = 0;
    }

    // transform: position + banking + bob
    this.group.position.set(this.x, 0, this.z);
    const targetBank = -this.vx * 0.016;
    this.bank = damp(this.bank, targetBank, 8, dt);
    this.group.rotation.set(this.vz * 0.0022, 0, this.bank);
    this.group.position.y = Math.sin(this.animT * 2.4) * 0.14;

    // invulnerability: shield-pulse emissive (never hide the ship)
    if (this.alive) this.ship.group.visible = true;

    // engine flame flicker
    const th = 1 + Math.sin(this.animT * 26) * 0.16 + Math.sin(this.animT * 41) * 0.08;
    for (const f of this.ship.engineFlames) {
      f.scale.set(th, th, 1 + (Math.hypot(this.vx, this.vz) / PLAYER.SPEED) * 0.75);
    }

    // heart pulse + orbiters
    if (this.ship.heart.visible) {
      const s = 1 + Math.sin(this.animT * 4.2) * 0.16;
      this.ship.heartCore.scale.setScalar(s);
      for (const vm of this.ship.veinMats) vm.emissiveIntensity = 1.35 + Math.sin(this.animT * 3.4) * 0.55;
    }
    if (this.ship.orbiters.visible) {
      this.ship.orbiterMotes.forEach((m, i) => {
        const a = this.animT * 1.7 + (i / 3) * Math.PI * 2;
        m.position.set(Math.cos(a) * 3.3, 0.75 + Math.sin(a * 1.6) * 0.45, Math.sin(a) * 3.3);
        m.rotation.y = a * 2;
      });
    }
    // dna accent animation
    if (this.ship.dnaElectric.visible) {
      this.ship.dnaElectric.rotation.y = Math.sin(this.animT * 2.2) * 0.08;
    }
    if (this.ship.dnaPlasma.visible) {
      this.ship.dnaPlasma.children.forEach((c, i) => {
        c.position.y = 0.55 + Math.sin(this.animT * 3 + i) * 0.18;
      });
    }
    if (this.ship.dnaIce.visible) {
      this.ship.dnaIce.rotation.y = Math.sin(this.animT * 1.1) * 0.05;
    }

    // damage flash + invuln shield pulse (multiplies each material's own emissive design)
    const flash = this.flashTimer > 0 ? this.flashTimer / 0.35 : 0;
    const invPulse = this.invuln > 0 ? 0.85 + Math.sin(this.animT * 18) * 0.65 : 0;
    for (const m of this.ship.allMats) {
      const base = (m.userData.baseEmissiveIntensity as number) ?? 0.4;
      m.emissiveIntensity = base * (1 + flash * 5.5 + invPulse);
    }
  }

  /** Auto-fire. Returns number of shots fired this frame. */
  advanceFire(dt: number, ctx: FireContext): number {
    if (!this.alive) return 0;
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return 0;
    const interval = PLAYER.FIRE_INTERVAL / fireRateMultiplier(this.evo);
    this.fireTimer = interval;
    this.fireVolley(ctx);
    return 1;
  }

  private fireVolley(ctx: FireContext): void {
    const { projectiles, particles } = ctx;
    const n = volleySize(this.evo);
    const effects = this.evo.effects;
    const combo = this.evo.combo;
    const dmg = PLAYER.BULLET_DAMAGE * damageMultiplier(this.evo);

    let kind: 'bolt' | 'fire' | 'plasma' | 'ice' | 'electric' | 'lance' | 'nova' = 'bolt';
    if (combo === 'chain_nova') kind = 'nova';
    else if (combo === 'cryo_lance') kind = 'lance';
    else if (effects.includes('plasma')) kind = 'plasma';
    else if (effects.includes('fire')) kind = 'fire';
    else if (effects.includes('ice')) kind = 'ice';
    else if (effects.includes('electric')) kind = 'electric';

    const speed = kind === 'lance' ? 52 : kind === 'nova' ? 46 : PLAYER.BULLET_SPEED;
    const baseDmg = kind === 'plasma' ? dmg * 1.5 : kind === 'lance' ? dmg * 1.35 : kind === 'nova' ? dmg * 1.7 : dmg;

    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * 0.85;
      const px = this.x + off * 0.62;
      const pz = this.z - 2.1;
      projectiles.fire({
        kind,
        x: px,
        y: 0.55,
        z: pz,
        angle: Math.PI / 2 + off * 0.045,
        speed,
        damage: baseDmg,
        friendly: true,
        pierce: kind === 'lance' ? 4 : kind === 'nova' ? 1 : 0,
        aoe: kind === 'nova' ? 3.4 : 0,
        life: 2.6,
      });
      // muzzle flash
      particles.spawn(
        px,
        0.55,
        pz,
        (Math.random() - 0.5) * 3,
        0.4,
        -14 - Math.random() * 6,
        new THREE.Color(kind === 'fire' ? 0xff9a4a : kind === 'ice' ? 0x7ad8ff : kind === 'electric' ? 0xffe23a : kind === 'nova' ? 0xffc23a : 0x7ae8ff),
        0.95,
        0.5,
        0.16,
        4,
      );
    }
  }

  /** MEGA BURST — radial devastation + projectile clear. */
  megaBurst(particles: Particles, projectiles: Projectiles): { damage: number; radius: number } | null {
    if (this.megaEnergy < PLAYER.MEGA_MAX || this.megaCooldown > 0 || !this.alive) return null;
    this.megaEnergy = 0;
    this.megaCooldown = 1.4;
    this.invuln = Math.max(this.invuln, 1.1);

    const col = new THREE.Color(0x66e8ff);
    const warm = new THREE.Color(0xb06bff);
    particles.flash(this.x, 1.2, this.z, 10, col, 0.3);
    particles.ring(this.x, 0.25, this.z, 22, col, 0.85);
    particles.ring(this.x, 0.3, this.z, 14, warm, 0.6);
    particles.burst(this.x, 0.9, this.z, {
      count: 90,
      speed: 26,
      size: 0.85,
      life: 0.9,
      color: col,
      color2: warm,
      drag: 1.8,
    });
    particles.burst(this.x, 0.9, this.z, {
      count: 40,
      speed: 12,
      size: 1.5,
      life: 1.5,
      color: warm,
      color2: new THREE.Color(0x2a1a5a),
      drag: 1.1,
      gravity: -1,
      spreadY: 1.1,
    });
    projectiles.clear(false, true);
    if (this.onMegaBurst) this.onMegaBurst();
    return { damage: PLAYER.BURST_DAMAGE, radius: PLAYER.BURST_RADIUS };
  }

  dispose(): void {
    for (const m of this.ship.allMats) m.dispose();
    this.ship.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
