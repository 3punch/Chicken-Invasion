/**
 * DNA fragment and health pickups — floating, glowing, magnetized collectibles.
 */
import * as THREE from 'three';
import type { DNAKind } from './types';
import type { Particles } from './Particles';
import { damp } from './utils';

export interface Pickup {
  active: boolean;
  kind: DNAKind | 'health';
  group: THREE.Group;
  mesh: THREE.Mesh;
  halo: THREE.Mesh;
  ring: THREE.Mesh;
  spin: number;
  age: number;
  vx: number;
  vz: number;
}

const DNA_STYLE: Record<DNAKind | 'health', { color: number; glow: number; shape: 'octa' | 'ico' | 'shard' | 'ring' | 'cross' }> = {
  fire: { color: 0xff7a2a, glow: 0xffb060, shape: 'octa' },
  plasma: { color: 0xc23cff, glow: 0xe88aff, shape: 'ico' },
  ice: { color: 0x3fb8ff, glow: 0x9fe4ff, shape: 'shard' },
  electric: { color: 0xffc21a, glow: 0xffe86a, shape: 'ring' },
  health: { color: 0x2fe88a, glow: 0x8affc0, shape: 'cross' },
};

const geoCache: Record<string, THREE.BufferGeometry> = {};
function shapeGeo(shape: string): THREE.BufferGeometry {
  if (!geoCache[shape]) {
    switch (shape) {
      case 'octa':
        geoCache[shape] = new THREE.OctahedronGeometry(0.55, 0);
        break;
      case 'ico':
        geoCache[shape] = new THREE.IcosahedronGeometry(0.5, 0);
        break;
      case 'shard': {
        const g = new THREE.OctahedronGeometry(0.5, 0);
        g.scale(0.62, 1.65, 0.62);
        geoCache[shape] = g;
        break;
      }
      case 'ring':
        geoCache[shape] = new THREE.TorusGeometry(0.42, 0.16, 8, 16);
        break;
      case 'cross': {
        const a = new THREE.BoxGeometry(0.28, 0.28, 1.05);
        geoCache[shape] = a;
        break;
      }
    }
  }
  return geoCache[shape];
}

export class Pickups {
  readonly group = new THREE.Group();
  private pool: Pickup[] = [];
  private textures: THREE.Texture[] = [];

  constructor(poolSize = 48) {
    for (let i = 0; i < poolSize; i++) {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(
        shapeGeo('octa'),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 1.8,
          metalness: 0.2,
          roughness: 0.3,
        }),
      );
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(1.05, 12, 8),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.13,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.055, 6, 22),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      group.add(mesh, halo, ring);
      group.visible = false;
      this.group.add(group);
      this.pool.push({ active: false, kind: 'fire', group, mesh, halo, ring, spin: 0, age: 0, vx: 0, vz: 0 });
    }
  }

  spawn(kind: DNAKind | 'health', x: number, z: number, scatter = true): void {
    const p = this.pool.find((q) => !q.active);
    if (!p) return;
    const style = DNA_STYLE[kind];
    p.active = true;
    p.kind = kind;
    p.age = 0;
    p.group.visible = true;
    p.group.position.set(x, 0.9, z);
    p.mesh.geometry = shapeGeo(style.shape);
    const m = p.mesh.material as THREE.MeshStandardMaterial;
    m.color.setHex(style.color);
    m.emissive.setHex(style.glow);
    (p.halo.material as THREE.MeshBasicMaterial).color.setHex(style.glow);
    (p.ring.material as THREE.MeshBasicMaterial).color.setHex(style.glow);
    const ang = Math.random() * Math.PI * 2;
    const sp = scatter ? 3.2 + Math.random() * 3 : 0;
    p.vx = Math.cos(ang) * sp;
    p.vz = Math.sin(ang) * sp;
    p.spin = 1.4 + Math.random() * 1.6;
  }

  /**
   * Update all pickups. `collect(kind)` fires when one is picked up.
   */
  update(
    dt: number,
    time: number,
    playerX: number,
    playerZ: number,
    playerAlive: boolean,
    particles: Particles,
    collect: (kind: DNAKind | 'health', x: number, z: number) => void,
  ): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      const g = p.group;
      // scatter decay + drift
      p.vx *= Math.exp(-2.4 * dt);
      p.vz *= Math.exp(-2.4 * dt);
      g.position.x += p.vx * dt;
      g.position.z += p.vz * dt;

      // magnet toward player
      if (playerAlive) {
        const dx = playerX - g.position.x;
        const dz = playerZ - g.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 7.5) {
          const pull = damp(0, 26, 3, dt) + (7.5 - d) * 5.2;
          g.position.x += (dx / Math.max(d, 0.001)) * pull * dt;
          g.position.z += (dz / Math.max(d, 0.001)) * pull * dt;
        }
        if (d < 1.75) {
          p.active = false;
          g.visible = false;
          const style = DNA_STYLE[p.kind];
          particles.burst(g.position.x, 1, g.position.z, {
            count: 10,
            speed: 6,
            size: 0.34,
            life: 0.5,
            color: new THREE.Color(style.glow),
            color2: new THREE.Color(style.color),
          });
          particles.ring(g.position.x, 0.9, g.position.z, 2.6, new THREE.Color(style.glow), 0.32);
          collect(p.kind, g.position.x, g.position.z);
          continue;
        }
      }

      // idle float animation
      p.mesh.rotation.y += p.spin * dt;
      p.mesh.rotation.x += p.spin * 0.4 * dt;
      g.position.y = 0.95 + Math.sin(time * 2.6 + p.age * 2.2) * 0.24;
      p.ring.rotation.z += dt * 1.4;

      // expire after a while (generous)
      if (p.age > 26) {
        p.active = false;
        g.visible = false;
      }
    }
  }

  clear(): void {
    for (const p of this.pool) {
      p.active = false;
      p.group.visible = false;
    }
  }

  dispose(): void {
    for (const p of this.pool) {
      p.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.material) (m.material as THREE.Material).dispose();
      });
    }
    for (const g of Object.values(geoCache)) g.dispose();
  }
}
