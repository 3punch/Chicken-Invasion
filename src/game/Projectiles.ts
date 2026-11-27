/**
 * Pooled projectiles for player and enemies. Each projectile is a small group
 * with a shaped core mesh + additive halo sprite, plus emitted trail particles.
 */
import * as THREE from 'three';
import { Particles } from './Particles';

export type ProjKind =
  | 'bolt'
  | 'fire'
  | 'plasma'
  | 'ice'
  | 'electric'
  | 'lance'
  | 'nova'
  | 'enemy'
  | 'enemyBig'
  | 'rocket'
  | 'bossOrb';

export interface FireOpts {
  kind: ProjKind;
  x: number;
  y: number;
  z: number;
  angle: number; // direction: 0 = +X, π/2 = -Z (see utils.angleTo)
  speed: number;
  damage: number;
  friendly: boolean;
  radius?: number;
  pierce?: number;
  aoe?: number;
  life?: number;
  homing?: number; // steering rate rad/s toward target
  target?: { x: number; z: number } | null;
  scale?: number;
}

export interface Projectile {
  active: boolean;
  group: THREE.Group;
  core: THREE.Mesh;
  halo: THREE.Sprite;
  kind: ProjKind;
  friendly: boolean;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  radius: number;
  pierce: number;
  aoe: number;
  life: number;
  age: number;
  homing: number;
  target: { x: number; z: number } | null;
  spin: number;
  hitSet: Set<number>;
}

const KIND_STYLE: Record<
  ProjKind,
  {
    color: number;
    haloColor: number;
    geo: 'capsule' | 'sphere' | 'octa' | 'long';
    size: number;
    haloScale: number;
    trailColor: number;
    trailRate: number;
    spin: number;
  }
> = {
  bolt: { color: 0x9ff4ff, haloColor: 0x33ccff, geo: 'capsule', size: 0.5, haloScale: 1.35, trailColor: 0x44bbff, trailRate: 0.5, spin: 0 },
  fire: { color: 0xffd08a, haloColor: 0xff6a1a, geo: 'capsule', size: 0.62, haloScale: 1.55, trailColor: 0xff7a2a, trailRate: 0.8, spin: 0 },
  plasma: { color: 0xffd2ff, haloColor: 0xd23cff, geo: 'sphere', size: 0.72, haloScale: 1.8, trailColor: 0xc43cff, trailRate: 0.8, spin: 0 },
  ice: { color: 0xd6fbff, haloColor: 0x2fa8ff, geo: 'octa', size: 0.68, haloScale: 1.5, trailColor: 0x59c8ff, trailRate: 0.6, spin: 6 },
  electric: { color: 0xfff7a8, haloColor: 0xffd21a, geo: 'capsule', size: 0.56, haloScale: 1.6, trailColor: 0xffd21a, trailRate: 0.9, spin: 0 },
  lance: { color: 0xeafcff, haloColor: 0x66d9ff, geo: 'long', size: 1.0, haloScale: 2.1, trailColor: 0x66d9ff, trailRate: 1.0, spin: 0 },
  nova: { color: 0xffe9b0, haloColor: 0xff9a2a, geo: 'sphere', size: 0.85, haloScale: 2.0, trailColor: 0xffb03a, trailRate: 1.0, spin: 3 },
  enemy: { color: 0xff9a7a, haloColor: 0xff3a2a, geo: 'sphere', size: 0.52, haloScale: 1.35, trailColor: 0xff4a2a, trailRate: 0.35, spin: 0 },
  enemyBig: { color: 0xffb0e0, haloColor: 0xb02aff, geo: 'sphere', size: 0.95, haloScale: 1.9, trailColor: 0xb02aff, trailRate: 0.5, spin: 0 },
  rocket: { color: 0xffe0c0, haloColor: 0xff7a2a, geo: 'long', size: 0.9, haloScale: 1.6, trailColor: 0xff7a2a, trailRate: 1.4, spin: 0 },
  bossOrb: { color: 0xffc0e8, haloColor: 0xff2a8a, geo: 'sphere', size: 1.15, haloScale: 2.3, trailColor: 0xff2a8a, trailRate: 0.7, spin: 2 },
};

let haloTexture: THREE.Texture | null = null;
const getHaloTexture = (): THREE.Texture => {
  if (haloTexture) return haloTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  haloTexture = new THREE.CanvasTexture(c);
  return haloTexture;
};

const geos: Record<string, THREE.BufferGeometry> = {};
const getGeo = (kind: 'capsule' | 'sphere' | 'octa' | 'long'): THREE.BufferGeometry => {
  if (!geos[kind]) {
    switch (kind) {
      case 'capsule':
        geos[kind] = new THREE.CapsuleGeometry(0.22, 0.85, 4, 10).rotateX(Math.PI / 2);
        break;
      case 'sphere':
        geos[kind] = new THREE.IcosahedronGeometry(0.5, 1);
        break;
      case 'octa':
        geos[kind] = new THREE.OctahedronGeometry(0.55, 0);
        break;
      case 'long':
        geos[kind] = new THREE.CapsuleGeometry(0.3, 1.7, 4, 10).rotateX(Math.PI / 2);
        break;
    }
  }
  return geos[kind];
};

export class Projectiles {
  readonly group = new THREE.Group();
  private pool: Projectile[] = [];
  private particles: Particles;
  private trailClock = 0;

  constructor(particles: Particles, poolSize = 220) {
    this.particles = particles;
    const haloTex = getHaloTexture();
    for (let i = 0; i < poolSize; i++) {
      const group = new THREE.Group();
      const core = new THREE.Mesh(
        getGeo('capsule'),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 1.45,
          roughness: 0.35,
          metalness: 0.1,
        }),
      );
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: haloTex,
          color: 0x33ccff,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      group.add(core, halo);
      group.visible = false;
      this.group.add(group);
      this.pool.push({
        active: false,
        group,
        core,
        halo,
        kind: 'bolt',
        friendly: true,
        vx: 0,
        vy: 0,
        vz: 0,
        damage: 1,
        radius: 0.5,
        pierce: 0,
        aoe: 0,
        life: 3,
        age: 0,
        homing: 0,
        target: null,
        spin: 0,
        hitSet: new Set(),
      });
    }
  }

  fire(opts: FireOpts): Projectile | null {
    const p = this.pool.find((q) => !q.active);
    if (!p) return null;
    const style = KIND_STYLE[opts.kind];
    p.active = true;
    p.kind = opts.kind;
    p.friendly = opts.friendly;
    p.group.visible = true;
    p.group.position.set(opts.x, opts.y, opts.z);
    p.core.geometry = getGeo(style.geo);
    const s = opts.scale ?? 1;
    p.core.scale.setScalar(style.size * s);
    (p.core.material as THREE.MeshStandardMaterial).color.setHex(style.color);
    (p.core.material as THREE.MeshStandardMaterial).emissive.setHex(style.color);
    p.halo.material.color.setHex(style.haloColor);
    p.halo.scale.setScalar(style.haloScale * s);
    const dirX = Math.cos(opts.angle);
    const dirZ = -Math.sin(opts.angle);
    p.vx = dirX * opts.speed;
    p.vz = dirZ * opts.speed;
    p.vy = 0;
    p.damage = opts.damage;
    p.radius = opts.radius ?? style.size * 0.72;
    p.pierce = opts.pierce ?? 0;
    p.aoe = opts.aoe ?? 0;
    p.life = opts.life ?? 4.2;
    p.age = 0;
    p.homing = opts.homing ?? 0;
    p.target = opts.target ?? null;
    p.spin = style.spin;
    p.hitSet.clear();
    // Orient along travel direction
    p.group.rotation.set(0, -opts.angle, 0);
    return p;
  }

  update(dt: number): void {
    this.trailClock += dt;
    const emitTrail = this.trailClock % 0.05 < dt;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age > p.life) {
        this.kill(p);
        continue;
      }
      if (p.homing > 0 && p.target) {
        const cur = Math.atan2(-p.vz, p.vx);
        const want = Math.atan2(-(p.target.z - p.group.position.z), p.target.x - p.group.position.x);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = Math.sign(diff) * Math.min(Math.abs(diff), p.homing * dt);
        const ang = cur + turn;
        const sp = Math.hypot(p.vx, p.vz);
        p.vx = Math.cos(ang) * sp;
        p.vz = -Math.sin(ang) * sp;
        p.group.rotation.y = -ang;
      }
      p.group.position.x += p.vx * dt;
      p.group.position.z += p.vz * dt;
      if (p.spin) {
        p.core.rotation.x += p.spin * dt;
        p.core.rotation.y += p.spin * 0.7 * dt;
      }
      if (emitTrail) {
        const style = KIND_STYLE[p.kind];
        if (Math.random() < style.trailRate) {
          this.particles.trail(
            p.group.position.x,
            p.group.position.y,
            p.group.position.z,
            new THREE.Color(style.trailColor),
            p.radius * 0.85,
            0.7,
          );
        }
      }
      // Soft despawn far outside playfield
      const pos = p.group.position;
      if (Math.abs(pos.x) > 70 || Math.abs(pos.z) > 46) this.kill(p);
    }
  }

  kill(p: Projectile): void {
    p.active = false;
    p.group.visible = false;
    p.target = null;
    p.hitSet.clear();
  }

  forEachActive(cb: (p: Projectile) => void): void {
    for (const p of this.pool) if (p.active) cb(p);
  }

  countActive(): number {
    let n = 0;
    for (const p of this.pool) if (p.active) n++;
    return n;
  }

  /** Destroy projectiles (all, or only enemy ones). Optionally burst them. */
  clear(friendly: boolean | 'all', burst = false): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      if (friendly !== 'all' && p.friendly !== friendly) continue;
      if (burst) {
        const style = KIND_STYLE[p.kind];
        this.particles.burst(p.group.position.x, p.group.position.y, p.group.position.z, {
          count: 4,
          speed: 5,
          size: 0.35,
          life: 0.4,
          color: new THREE.Color(style.trailColor),
        });
      }
      this.kill(p);
    }
  }

  dispose(): void {
    for (const p of this.pool) {
      (p.core.material as THREE.Material).dispose();
      (p.halo.material as THREE.Material).dispose();
    }
    for (const g of Object.values(geos)) g.dispose();
  }
}
