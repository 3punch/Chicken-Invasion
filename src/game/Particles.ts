/**
 * Pooled VFX engine: GPU point particles, billboard flashes, shockwave rings,
 * lightning arcs and beam meshes. Everything is pre-allocated and recycled.
 */
import * as THREE from 'three';

export interface BurstOpts {
  count?: number;
  speed?: number;
  speedVar?: number;
  size?: number;
  sizeVar?: number;
  life?: number;
  lifeVar?: number;
  color?: THREE.Color;
  color2?: THREE.Color;
  gravity?: number;
  drag?: number;
  spreadY?: number;
}

const makeSoftTexture = (inner: number, mid: number): THREE.Texture => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, `rgba(255,255,255,1)`);
  g.addColorStop(inner, `rgba(255,255,255,${mid})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const makeRingTexture = (): THREE.Texture => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 30, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.25)');
  g.addColorStop(0.78, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
};

const makeBeamTexture = (): THREE.Texture => {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 32, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 128);
  const h = ctx.createLinearGradient(0, 0, 0, 128);
  h.addColorStop(0, 'rgba(0,0,0,1)');
  h.addColorStop(0.15, 'rgba(0,0,0,0)');
  h.addColorStop(0.85, 'rgba(0,0,0,0)');
  h.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 32, 128);
  return new THREE.CanvasTexture(c);
};

export class Particles {
  readonly group = new THREE.Group();
  private max: number;
  private pos: Float32Array;
  private col: Float32Array;
  private siz: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseSize: Float32Array;
  private dragArr: Float32Array;
  private gravArr: Float32Array;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private points: THREE.Points;
  private cursor = 0;

  // Billboard flash pool
  private flashes: THREE.Mesh[] = [];
  private flashState: { life: number; maxLife: number; scale: number; grow: number }[] = [];
  private flashTex: THREE.Texture;

  // Shockwave ring pool
  private rings: THREE.Mesh[] = [];
  private ringState: { life: number; maxLife: number; scale: number; grow: number }[] = [];
  private ringTex: THREE.Texture;

  // Lightning arc pool
  private bolts: THREE.Line[] = [];
  private boltState: { life: number; maxLife: number }[] = [];

  // Beam pool (cryo lance / boss sweeps)
  private beams: THREE.Mesh[] = [];
  private beamState: { life: number; maxLife: number; len: number; grow: number }[] = [];
  private beamTex: THREE.Texture;

  private pixelScale = 20;
  private clock = 0;

  constructor(quality: 'high' | 'low' = 'high') {
    this.max = quality === 'high' ? 3200 : 1400;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 4);
    this.siz = new Float32Array(this.max);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.baseSize = new Float32Array(this.max);
    this.dragArr = new Float32Array(this.max);
    this.gravArr = new Float32Array(this.max);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.siz, 1));
    // Hide all points initially (size 0).
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTex: { value: makeSoftTexture(0.35, 0.55) },
        uPixelScale: { value: this.pixelScale },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aColor;
        attribute float aSize;
        varying vec4 vColor;
        varying float vSize;
        void main() {
          vColor = aColor;
          vSize = aSize;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        varying vec4 vColor;
        varying float vSize;
        void main() {
          if (vSize <= 0.0) discard;
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor.rgb * t.rgb, t.a * vColor.a);
        }
      `,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.group.add(this.points);

    this.flashTex = makeSoftTexture(0.25, 0.4);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: this.flashTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      m.visible = false;
      m.renderOrder = 19;
      this.flashes.push(m);
      this.flashState.push({ life: 0, maxLife: 1, scale: 1, grow: 1 });
      this.group.add(m);
    }

    this.ringTex = makeRingTexture();
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: this.ringTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      m.visible = false;
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 18;
      this.rings.push(m);
      this.ringState.push({ life: 0, maxLife: 1, scale: 1, grow: 1 });
      this.group.add(m);
    }

    for (let i = 0; i < 10; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
      const line = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      line.visible = false;
      line.renderOrder = 21;
      line.frustumCulled = false;
      this.bolts.push(line);
      this.boltState.push({ life: 0, maxLife: 1 });
      this.group.add(line);
    }

    this.beamTex = makeBeamTexture();
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: this.beamTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      m.visible = false;
      m.renderOrder = 17;
      this.beams.push(m);
      this.beamState.push({ life: 0, maxLife: 1, len: 1, grow: 0 });
      this.group.add(m);
    }
  }

  setPixelScale(scale: number): void {
    this.pixelScale = scale;
    this.mat.uniforms.uPixelScale.value = scale;
    // Point sizes are in pixels; particle world sizes get converted at spawn.
  }

  /** worldSize -> pixel size */
  private px(worldSize: number): number {
    return Math.max(1, worldSize * this.pixelScale);
  }

  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    alpha: number,
    worldSize: number,
    life: number,
    drag = 1.6,
    gravity = 0,
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 4] = color.r;
    this.col[i * 4 + 1] = color.g;
    this.col[i * 4 + 2] = color.b;
    this.col[i * 4 + 3] = alpha;
    this.siz[i] = this.px(worldSize);
    this.baseSize[i] = this.px(worldSize);
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.dragArr[i] = drag;
    this.gravArr[i] = gravity;
  }

  /** Omnidirectional burst of sparks + glow + smoke-ish particles. */
  burst(x: number, y: number, z: number, opts: BurstOpts = {}): void {
    const count = opts.count ?? 22;
    const speed = opts.speed ?? 10;
    const speedVar = opts.speedVar ?? 0.7;
    const size = opts.size ?? 0.55;
    const sizeVar = opts.sizeVar ?? 0.6;
    const life = opts.life ?? 0.7;
    const lifeVar = opts.lifeVar ?? 0.6;
    const c1 = opts.color ?? new THREE.Color(0xffb060);
    const c2 = opts.color2 ?? c1;
    const drag = opts.drag ?? 2.2;
    const grav = opts.gravity ?? 0;
    const spreadY = opts.spreadY ?? 0.75;
    for (let n = 0; n < count; n++) {
      const ang = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.5) * Math.PI * spreadY;
      const sp = speed * (1 - speedVar * Math.random());
      const vx = Math.cos(ang) * Math.cos(el) * sp;
      const vy = Math.sin(el) * sp * 0.9 + speed * 0.12 * Math.random();
      const vz = Math.sin(ang) * Math.cos(el) * sp;
      const t = Math.random();
      const col = c1.clone().lerp(c2, t);
      const s = size * (1 - sizeVar * Math.random() * 0.9 + sizeVar * 0.3);
      const l = life * (1 - lifeVar * Math.random() * 0.8);
      this.spawn(x, y, z, vx, vy, vz, col, 1, s, l, drag, grav);
    }
  }

  /** Cheap directional trail puff. */
  trail(x: number, y: number, z: number, color: THREE.Color, worldSize = 0.34, alpha = 0.85): void {
    this.spawn(
      x + (Math.random() - 0.5) * 0.16,
      y + (Math.random() - 0.5) * 0.16,
      z + (Math.random() - 0.5) * 0.16,
      (Math.random() - 0.5) * 1.2,
      (Math.random() - 0.5) * 1.2 + 0.6,
      (Math.random() - 0.5) * 1.2,
      color,
      alpha,
      worldSize,
      0.34,
      3.2,
    );
  }

  /** Big layered explosion: flash + sparks + embers + shockwave ring. */
  explosion(x: number, y: number, z: number, scale = 1, palette?: { hot: THREE.Color; warm: THREE.Color; smoke: THREE.Color }): void {
    const hot = palette?.hot ?? new THREE.Color(0xfff2c0);
    const warm = palette?.warm ?? new THREE.Color(0xff7a2a);
    const smoke = palette?.smoke ?? new THREE.Color(0x5a2f30);
    this.flash(x, y + 0.2, z, scale * 2.4, hot, 0.22);
    this.burst(x, y, z, {
      count: Math.round(16 * scale),
      speed: 12 * scale,
      size: 0.5 * scale,
      life: 0.5,
      color: hot,
      color2: warm,
    });
    this.burst(x, y, z, {
      count: Math.round(18 * scale),
      speed: 6.5 * scale,
      size: 0.8 * scale,
      life: 1.15,
      color: warm,
      color2: smoke,
      drag: 1.6,
      gravity: -2.2,
    });
    this.burst(x, y, z, {
      count: Math.round(8 * scale),
      speed: 3 * scale,
      size: 1.5 * scale,
      life: 1.5,
      color: smoke,
      color2: new THREE.Color(0x221820),
      drag: 1.1,
      gravity: -1.2,
      spreadY: 1.2,
    });
    this.ring(x, y, z, scale * 3.2, warm, 0.5);
  }

  flash(x: number, y: number, z: number, scale: number, color: THREE.Color, life = 0.18): void {
    let idx = this.flashes.findIndex((f) => !f.visible);
    if (idx < 0) idx = 0;
    const m = this.flashes[idx];
    const st = this.flashState[idx];
    m.visible = true;
    m.position.set(x, y, z);
    m.scale.setScalar(scale * 0.4);
    m.rotation.set(-Math.PI / 2, 0, 0);
    (m.material as THREE.MeshBasicMaterial).color.copy(color);
    (m.material as THREE.MeshBasicMaterial).opacity = 1;
    st.life = life;
    st.maxLife = life;
    st.scale = scale * 0.4;
    st.grow = scale;
  }

  ring(x: number, y: number, z: number, scale: number, color: THREE.Color, life = 0.5): void {
    let idx = this.rings.findIndex((r) => !r.visible);
    if (idx < 0) idx = 0;
    const m = this.rings[idx];
    const st = this.ringState[idx];
    m.visible = true;
    m.position.set(x, y, z);
    m.scale.setScalar(scale * 0.3);
    (m.material as THREE.MeshBasicMaterial).color.copy(color);
    (m.material as THREE.MeshBasicMaterial).opacity = 1;
    st.life = life;
    st.maxLife = life;
    st.scale = scale * 0.3;
    st.grow = scale * 1.6;
  }

  /** Jagged lightning arc between two points. */
  lightning(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: THREE.Color, life = 0.22): void {
    let idx = this.bolts.findIndex((b) => !b.visible);
    if (idx < 0) idx = 0;
    const line = this.bolts[idx];
    const st = this.boltState[idx];
    const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const segs = 15;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const jx = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * 1.1;
      const jy = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * 0.7;
      const jz = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * 1.1;
      arr[i * 3] = ax + (bx - ax) * t + jx;
      arr[i * 3 + 1] = ay + (by - ay) * t + jy;
      arr[i * 3 + 2] = az + (bz - az) * t + jz;
    }
    attr.needsUpdate = true;
    line.visible = true;
    (line.material as THREE.LineBasicMaterial).color.copy(color);
    (line.material as THREE.LineBasicMaterial).opacity = 1;
    st.life = life;
    st.maxLife = life;
  }

  /**
   * Beam segment lying flat in the XZ plane, starting at (x,z) and extending
   * along `dirAngle` (radians, same convention as angleTo: 0 = +X, π/2 = -Z).
   */
  beam(x: number, y: number, z: number, dirAngle: number, length: number, width: number, color: THREE.Color, life = 0.3): void {
    let idx = this.beams.findIndex((b) => !b.visible);
    if (idx < 0) idx = 0;
    const m = this.beams[idx];
    const st = this.beamState[idx];
    m.visible = true;
    m.position.set(x, y, z);
    m.rotation.set(-Math.PI / 2, 0, 0);
    m.rotateZ(Math.PI / 2 - dirAngle);
    m.scale.set(width, length, 1);
    m.translateY(length / 2);
    (m.material as THREE.MeshBasicMaterial).color.copy(color);
    (m.material as THREE.MeshBasicMaterial).opacity = 1;
    st.life = life;
    st.maxLife = life;
    st.len = length;
    st.grow = length * 0.35;
  }

  update(dt: number): void {
    this.clock += dt;
    // particles
    const { pos, col, siz, vel, life, maxLife, baseSize, dragArr, gravArr } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) {
        if (siz[i] !== 0) siz[i] = 0;
        continue;
      }
      life[i] -= dt;
      const i3 = i * 3;
      const drag = Math.exp(-dragArr[i] * dt);
      vel[i3] *= drag;
      vel[i3 + 1] = vel[i3 + 1] * drag + gravArr[i] * dt;
      vel[i3 + 2] *= drag;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      const t = Math.max(0, life[i] / maxLife[i]);
      siz[i] = baseSize[i] * (0.25 + 0.75 * t);
      col[i * 4 + 3] = t * t * (3 - 2 * t) * 0.95 + 0.05;
      if (life[i] <= 0) siz[i] = 0;
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('aColor').needsUpdate = true;
    this.geo.getAttribute('aSize').needsUpdate = true;

    // flashes
    for (let i = 0; i < this.flashes.length; i++) {
      const m = this.flashes[i];
      if (!m.visible) continue;
      const st = this.flashState[i];
      st.life -= dt;
      const t = 1 - Math.max(0, st.life / st.maxLife);
      m.scale.setScalar(st.scale + st.grow * t * 1.4);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t * 1.35);
      if (st.life <= 0) m.visible = false;
    }

    // rings
    for (let i = 0; i < this.rings.length; i++) {
      const m = this.rings[i];
      if (!m.visible) continue;
      const st = this.ringState[i];
      st.life -= dt;
      const t = 1 - Math.max(0, st.life / st.maxLife);
      m.scale.setScalar(st.scale + st.grow * t);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - t) * 0.85);
      if (st.life <= 0) m.visible = false;
    }

    // bolts
    for (let i = 0; i < this.bolts.length; i++) {
      const m = this.bolts[i];
      if (!m.visible) continue;
      const st = this.boltState[i];
      st.life -= dt;
      (m.material as THREE.LineBasicMaterial).opacity = Math.max(0, st.life / st.maxLife);
      if (st.life <= 0) m.visible = false;
    }

    // beams
    for (let i = 0; i < this.beams.length; i++) {
      const m = this.beams[i];
      if (!m.visible) continue;
      const st = this.beamState[i];
      st.life -= dt;
      const t = 1 - Math.max(0, st.life / st.maxLife);
      m.scale.set(m.scale.x, st.len + st.grow * t, 1);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t * 1.2);
      if (st.life <= 0) m.visible = false;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    for (const m of [...this.flashes, ...this.rings, ...this.beams]) {
      (m.material as THREE.Material).dispose();
      m.geometry.dispose();
    }
    for (const b of this.bolts) {
      (b.material as THREE.Material).dispose();
      b.geometry.dispose();
    }
  }
}
