/**
 * Deep-space environment: animated nebula shader backdrop, parallax starfield,
 * planets with atmospheres, drifting asteroid fields and an alien armada.
 * Palettes and props cross-fade per stage.
 */
import * as THREE from 'three';
import { clamp, damp, randRange } from './utils';

interface StagePalette {
  fog: number;
  fogDensity: number;
  ambient: number;
  ambientIntensity: number;
  key: number;
  keyIntensity: number;
  fill: number;
  fillIntensity: number;
  nebulaA: number;
  nebulaB: number;
  nebulaC: number;
  starTint: number;
}

const PALETTES: StagePalette[] = [
  {
    // Stage 1 — Earth orbit: cool blues
    fog: 0x060c22,
    fogDensity: 0.0032,
    ambient: 0x4a5e94,
    ambientIntensity: 1.15,
    key: 0xfff2dd,
    keyIntensity: 2.5,
    fill: 0x4a7aff,
    fillIntensity: 1.25,
    nebulaA: 0x04081c,
    nebulaB: 0x16386e,
    nebulaC: 0x2a7fd8,
    starTint: 0xbfd8ff,
  },
  {
    // Stage 2 — The Nebula: violet / magenta
    fog: 0x14082e,
    fogDensity: 0.0038,
    ambient: 0x6a4a9e,
    ambientIntensity: 1.25,
    key: 0xffd8f2,
    keyIntensity: 2.35,
    fill: 0xb04aff,
    fillIntensity: 1.55,
    nebulaA: 0x12062a,
    nebulaB: 0x6a1fa8,
    nebulaC: 0xff5ac8,
    starTint: 0xffd8f8,
  },
  {
    // Stage 3 — The Armada: dark crimson
    fog: 0x12040a,
    fogDensity: 0.0042,
    ambient: 0x6e2c38,
    ambientIntensity: 1.1,
    key: 0xffb08a,
    keyIntensity: 2.45,
    fill: 0xff3a5a,
    fillIntensity: 1.45,
    nebulaA: 0x0a0308,
    nebulaB: 0x581018,
    nebulaC: 0xff4a2a,
    starTint: 0xffc8b0,
  },
];

const lerpColor = (out: THREE.Color, target: number, t: number): void => {
  out.lerp(new THREE.Color(target), t);
};

/* ---------------- nebula shader ---------------- */

const NEBULA_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColC;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.02 + vec2(11.3, -7.1);
      a *= 0.52;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv * vec2(3.2, 2.1);
    float t = uTime * 0.014;
    float warp = fbm(uv * 1.35 + t);
    float n = fbm(uv + warp * 1.15 - t * 0.6);
    float m = fbm(uv * 2.1 - t * 0.8 + warp);
    vec3 col = mix(uColA, uColB, smoothstep(0.28, 0.85, n));
    col = mix(col, uColC, pow(smoothstep(0.42, 0.98, m), 2.4) * 0.85);
    // bright wisps
    float wisp = pow(max(0.0, fbm(uv * 3.0 + vec2(t * 1.7, -t)) - 0.52), 2.0) * 2.4;
    col += uColC * wisp * 0.5;
    col *= 0.9 + 0.2 * n;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ---------------- atmosphere fresnel ---------------- */

const ATMO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uPower);
    gl_FragColor = vec4(uColor * f, f * 0.85);
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

/* ---------------- helpers ---------------- */

const makeNoiseTexture = (size: number, base: string, blob: string, count: number, blobR: number): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = blobR * (0.4 + Math.random() * 0.9);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, blob);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.22 + Math.random() * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

interface Asteroid {
  mesh: THREE.Mesh;
  spin: THREE.Vector3;
  drift: THREE.Vector3;
}

export class Environment {
  readonly group = new THREE.Group();
  private scene: THREE.Scene;

  private nebula: THREE.Mesh;
  private nebulaMat: THREE.ShaderMaterial;

  private starLayers: THREE.Points[] = [];
  private starTintMats: THREE.PointsMaterial[] = [];

  private planetGroup = new THREE.Group();
  private planet: THREE.Mesh;
  private clouds: THREE.Mesh;
  private atmo: THREE.Mesh;
  private ringMesh: THREE.Mesh | null = null;

  private asteroids: Asteroid[] = [];
  private motherships: THREE.Group[] = [];
  private dust: THREE.Points;
  private dustVel: Float32Array;

  private ambient: THREE.AmbientLight;
  private key: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;

  private stage = 0;
  private time = 0;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;

    // --- image-based lighting so metals don't render black ---
    const pmrem = new THREE.PMREMGenerator(renderer);
    try {
      const envScene = new THREE.Scene();
      // simple gradient "space studio": dark base, two soft colored light panels
      const grad = new THREE.Mesh(
        new THREE.SphereGeometry(60, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x202844, side: THREE.BackSide }),
      );
      envScene.add(grad);
      const panelA = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.MeshBasicMaterial({ color: 0x86b8ff }),
      );
      panelA.position.set(25, 35, -10);
      panelA.lookAt(0, 0, 0);
      envScene.add(panelA);
      const panelB = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.MeshBasicMaterial({ color: 0xff8ac8 }),
      );
      panelB.position.set(-30, 12, 22);
      panelB.lookAt(0, 0, 0);
      envScene.add(panelB);
      const panelC = new THREE.Mesh(
        new THREE.PlaneGeometry(26, 26),
        new THREE.MeshBasicMaterial({ color: 0x5a4aff }),
      );
      panelC.position.set(0, -26, -24);
      panelC.lookAt(0, 0, 0);
      envScene.add(panelC);
      const envTex = pmrem.fromScene(envScene, 0.08).texture;
      scene.environment = envTex;
      scene.environmentIntensity = 0.55;
      grad.geometry.dispose();
      (grad.material as THREE.Material).dispose();
    } catch {
      /* environment bake is optional */
    }
    pmrem.dispose();

    // --- nebula backdrop ---
    this.nebulaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColA: { value: new THREE.Color(PALETTES[0].nebulaA) },
        uColB: { value: new THREE.Color(PALETTES[0].nebulaB) },
        uColC: { value: new THREE.Color(PALETTES[0].nebulaC) },
      },
      vertexShader: NEBULA_VERT,
      fragmentShader: NEBULA_FRAG,
      depthWrite: false,
    });
    this.nebula = new THREE.Mesh(new THREE.PlaneGeometry(340, 230), this.nebulaMat);
    this.nebula.rotation.x = -Math.PI / 2;
    this.nebula.position.y = -46;
    this.nebula.renderOrder = -20;
    this.group.add(this.nebula);

    // --- star layers (parallax via y-depth + camera follow) ---
    for (let layer = 0; layer < 3; layer++) {
      const count = layer === 0 ? 320 : layer === 1 ? 190 : 90;
      const pos = new Float32Array(count * 3);
      const size = layer === 0 ? 0.55 : layer === 1 ? 0.95 : 1.55;
      for (let i = 0; i < count; i++) {
        pos[i * 3] = randRange(-140, 140);
        pos[i * 3 + 1] = -42 + layer * 3.2;
        pos[i * 3 + 2] = randRange(-95, 95);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({
        color: PALETTES[0].starTint,
        size,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.55 + layer * 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(g, m);
      points.renderOrder = -18 + layer;
      points.frustumCulled = false;
      this.starLayers.push(points);
      this.starTintMats.push(m);
      this.group.add(points);
    }

    // --- planet (rebuilt look per stage via textures) ---
    this.planet = new THREE.Mesh(
      new THREE.SphereGeometry(26, 42, 30),
      new THREE.MeshStandardMaterial({
        map: makeNoiseTexture(256, '#2a5cb8', '#4aa86a', 60, 46),
        emissive: 0x10244a,
        emissiveIntensity: 0.35,
        roughness: 0.82,
        metalness: 0.05,
      }),
    );
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(26.6, 36, 24),
      new THREE.MeshStandardMaterial({
        map: makeNoiseTexture(256, 'rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 46, 60),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        roughness: 1,
      }),
    );
    this.atmo = new THREE.Mesh(
      new THREE.SphereGeometry(28.6, 36, 24),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0x4a9fff) }, uPower: { value: 2.6 } },
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      }),
    );
    this.planetGroup.add(this.planet, this.clouds, this.atmo);
    this.planetGroup.position.set(-38, -22, -46);
    this.planetGroup.renderOrder = -15;
    this.group.add(this.planetGroup);

    // --- asteroid field ---
    const rockTex = makeNoiseTexture(128, '#6e6458', '#3a352e', 42, 26);
    for (let i = 0; i < 22; i++) {
      const detail = i < 12 ? 1 : 0;
      const geo = new THREE.IcosahedronGeometry(randRange(1.1, 3.4), 1);
      // deform vertices with smooth low-frequency noise for rounded irregular silhouettes
      const arr = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let v = 0; v < arr.count; v++) {
        const x = arr.getX(v);
        const y = arr.getY(v);
        const z = arr.getZ(v);
        const s =
          1 +
          0.16 * Math.sin(x * 0.9 + i * 2.1) * Math.cos(z * 0.8 - i) +
          0.11 * Math.sin(y * 1.15 + i * 0.7) +
          0.06 * Math.sin((x + y + z) * 1.7 + i);
        arr.setXYZ(v, x * s, y * s * 0.85, z * s);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: 0xa89a86,
          map: rockTex,
          roughness: 0.88,
          metalness: 0.18,
          emissive: 0x2a2430,
          emissiveIntensity: 0.5,
        }),
      );
      const foreground = i >= 20;
      mesh.position.set(
        randRange(-70, 70),
        foreground ? randRange(12, 16) : randRange(-9, -2),
        randRange(-55, 55),
      );
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      if (foreground) mesh.scale.setScalar(1.7);
      this.asteroids.push({
        mesh,
        spin: new THREE.Vector3(randRange(-0.18, 0.18), randRange(-0.18, 0.18), randRange(-0.18, 0.18)),
        drift: new THREE.Vector3(randRange(-0.5, 0.5), 0, randRange(0.25, 1.1)),
      });
      this.group.add(mesh);
    }

    // --- cosmic dust ---
    const dustCount = 240;
    const dustPos = new Float32Array(dustCount * 3);
    this.dustVel = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = randRange(-60, 60);
      dustPos[i * 3 + 1] = randRange(-6, 4);
      dustPos[i * 3 + 2] = randRange(-45, 45);
      this.dustVel[i * 3] = randRange(-0.35, 0.35);
      this.dustVel[i * 3 + 1] = randRange(-0.1, 0.1);
      this.dustVel[i * 3 + 2] = randRange(0.4, 1.4);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0x8ab8ff,
        size: 0.34,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.dust.frustumCulled = false;
    this.group.add(this.dust);

    // --- alien motherships (stage 3 flavor, hidden otherwise) ---
    // NOTE: the camera is orthographic — distance does NOT shrink things,
    // so background fleet ships are built small to read as distant.
    for (let i = 0; i < 5; i++) {
      const ship = this.buildMothership(1 + i * 0.22);
      ship.position.set(randRange(-60, 60), -26 - i * 3, -30 - (i % 3) * 5);
      ship.rotation.y = randRange(-0.6, 0.6);
      ship.visible = false;
      this.motherships.push(ship);
      this.group.add(ship);
    }

    // --- lights ---
    this.ambient = new THREE.AmbientLight(PALETTES[0].ambient, PALETTES[0].ambientIntensity);
    this.key = new THREE.DirectionalLight(PALETTES[0].key, PALETTES[0].keyIntensity);
    this.key.position.set(18, 34, -20);
    this.fill = new THREE.DirectionalLight(PALETTES[0].fill, PALETTES[0].fillIntensity);
    this.fill.position.set(-22, 18, 16);
    const rim = new THREE.DirectionalLight(0x6a8fff, 0.9);
    rim.position.set(0, -20, 8);
    this.group.add(this.ambient, this.key, this.fill, rim);

    scene.fog = new THREE.FogExp2(PALETTES[0].fog, PALETTES[0].fogDensity);
  }

  private buildMothership(scale: number): THREE.Group {
    const g = new THREE.Group();
    const hull = new THREE.MeshStandardMaterial({ color: 0x241826, emissive: 0x2a0a14, emissiveIntensity: 0.7, metalness: 0.85, roughness: 0.42 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x300a10, emissive: 0xff2a3a, emissiveIntensity: 2.4, metalness: 0.2, roughness: 0.5 });

    // wedge hull
    const shape = new THREE.Shape();
    shape.moveTo(0, -14);
    shape.lineTo(9, 8);
    shape.lineTo(4, 13);
    shape.lineTo(-4, 13);
    shape.lineTo(-9, 8);
    shape.lineTo(0, -14);
    const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: true, bevelThickness: 1.4, bevelSize: 1.2, bevelSegments: 1 });
    hullGeo.rotateX(-Math.PI / 2);
    const body = new THREE.Mesh(hullGeo, hull);
    g.add(body);

    // spine tower
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.2, 7, 8), hull);
    tower.position.set(0, 5, 3);
    g.add(tower);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), glow);
    beacon.position.set(0, 9, 3);
    g.add(beacon);

    // window strips
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 6; i++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.5), glow);
        win.position.set(side * (3.2 + i * 0.72), 2.6, 2 + i * 1.15);
        g.add(win);
      }
      const engine = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 2.2), glow);
      engine.position.set(side * 4.4, 1.2, 11);
      g.add(engine);
    }
    g.scale.setScalar(scale * 0.42);
    return g;
  }

  setStage(index: number, instant = false): void {
    this.stage = clamp(index, 0, PALETTES.length - 1);
    if (instant) {
      const p = PALETTES[this.stage];
      (this.scene.fog as THREE.FogExp2).color.setHex(p.fog);
      (this.scene.fog as THREE.FogExp2).density = p.fogDensity;
      this.ambient.color.setHex(p.ambient);
      this.ambient.intensity = p.ambientIntensity;
      this.key.color.setHex(p.key);
      this.key.intensity = p.keyIntensity;
      this.fill.color.setHex(p.fill);
      this.fill.intensity = p.fillIntensity;
      this.nebulaMat.uniforms.uColA.value.setHex(p.nebulaA);
      this.nebulaMat.uniforms.uColB.value.setHex(p.nebulaB);
      this.nebulaMat.uniforms.uColC.value.setHex(p.nebulaC);
      for (const m of this.starTintMats) m.color.setHex(p.starTint);
      this.applyStageProps();
    }
  }

  /** Slowly blend palettes toward the current stage. */
  private blendPalette(dt: number): void {
    const p = PALETTES[this.stage];
    const t = 1 - Math.exp(-1.6 * dt);
    const fog = this.scene.fog as THREE.FogExp2;
    lerpColor(fog.color, p.fog, t);
    fog.density = damp(fog.density, p.fogDensity, 1.6, dt);
    lerpColor(this.ambient.color, p.ambient, t);
    this.ambient.intensity = damp(this.ambient.intensity, p.ambientIntensity, 1.6, dt);
    lerpColor(this.key.color, p.key, t);
    this.key.intensity = damp(this.key.intensity, p.keyIntensity, 1.6, dt);
    lerpColor(this.fill.color, p.fill, t);
    this.fill.intensity = damp(this.fill.intensity, p.fillIntensity, 1.6, dt);
    lerpColor(this.nebulaMat.uniforms.uColA.value as THREE.Color, p.nebulaA, t);
    lerpColor(this.nebulaMat.uniforms.uColB.value as THREE.Color, p.nebulaB, t);
    lerpColor(this.nebulaMat.uniforms.uColC.value as THREE.Color, p.nebulaC, t);
    for (const m of this.starTintMats) lerpColor(m.color, p.starTint, t);
    this.applyStageProps();
  }

  private applyStageProps(): void {
    // Planet appearance per stage
    const planetMat = this.planet.material as THREE.MeshStandardMaterial;
    const atmoMat = this.atmo.material as THREE.ShaderMaterial;
    const cloudMat = this.clouds.material as THREE.MeshStandardMaterial;
    if (this.stage === 0) {
      planetMat.color.setHex(0xffffff);
      planetMat.emissive.setHex(0x10244a);
      atmoMat.uniforms.uColor.value.setHex(0x4a9fff);
      cloudMat.opacity = 0.5;
      this.planetGroup.position.set(-38, -22, -46);
      this.planetGroup.scale.setScalar(1);
      this.setRing(false);
      for (const m of this.motherships) m.visible = false;
    } else if (this.stage === 1) {
      planetMat.color.setHex(0xd8a8ff);
      planetMat.emissive.setHex(0x3a1a6a);
      atmoMat.uniforms.uColor.value.setHex(0xd86aff);
      cloudMat.opacity = 0.32;
      this.planetGroup.position.set(42, -26, -52);
      this.planetGroup.scale.setScalar(1.35);
      this.setRing(true);
      for (const m of this.motherships) m.visible = false;
    } else {
      planetMat.color.setHex(0xff8a6a);
      planetMat.emissive.setHex(0x5a1208);
      atmoMat.uniforms.uColor.value.setHex(0xff4a2a);
      cloudMat.opacity = 0.18;
      this.planetGroup.position.set(0, -34, -70);
      this.planetGroup.scale.setScalar(1.6);
      this.setRing(false);
      for (const m of this.motherships) m.visible = true;
    }
  }

  private setRing(on: boolean): void {
    if (on && !this.ringMesh) {
      const geo = new THREE.RingGeometry(40, 58, 64);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xa86aff,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.ringMesh = new THREE.Mesh(geo, mat);
      this.ringMesh.rotation.x = Math.PI / 2.15;
      this.planetGroup.add(this.ringMesh);
    }
    if (this.ringMesh) this.ringMesh.visible = on;
  }

  update(dt: number, camX: number, camZ: number): void {
    this.time += dt;
    this.nebulaMat.uniforms.uTime.value = this.time;
    this.blendPalette(dt);

    // parallax: backdrop drifts slightly opposite the camera
    this.nebula.position.x = -camX * 0.12;
    this.nebula.position.z = -camZ * 0.12 - this.time * 0.16;
    this.planetGroup.position.x += ((this.stage === 1 ? 42 : this.stage === 2 ? 0 : -38) - camX * 0.06 - this.planetGroup.position.x) * Math.min(1, dt * 0.8);

    // stars drift
    this.starLayers.forEach((layer, i) => {
      layer.position.x = -camX * (0.05 + i * 0.045);
      layer.position.z = -camZ * (0.05 + i * 0.045) - (this.time * (0.24 + i * 0.22)) % 8;
    });

    // planet slow rotation + cloud drift
    this.planet.rotation.y += dt * 0.012;
    this.clouds.rotation.y += dt * 0.02;

    // asteroids
    for (const a of this.asteroids) {
      a.mesh.rotation.x += a.spin.x * dt;
      a.mesh.rotation.y += a.spin.y * dt;
      a.mesh.rotation.z += a.spin.z * dt;
      a.mesh.position.x += a.drift.x * dt - camX * 0.0025;
      a.mesh.position.z += a.drift.z * dt - camZ * 0.0025;
      if (a.mesh.position.z > 60) a.mesh.position.z = -60;
      if (a.mesh.position.x > 75) a.mesh.position.x = -75;
      if (a.mesh.position.x < -75) a.mesh.position.x = 75;
    }

    // dust
    const dpos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const darr = dpos.array as Float32Array;
    for (let i = 0; i < darr.length; i += 3) {
      darr[i] += this.dustVel[i] * dt;
      darr[i + 1] += this.dustVel[i + 1] * dt;
      darr[i + 2] += this.dustVel[i + 2] * dt;
      if (darr[i + 2] > 45) {
        darr[i + 2] = -45;
        darr[i] = randRange(-60, 60);
      }
    }
    dpos.needsUpdate = true;

    // motherships drift
    for (const m of this.motherships) {
      if (!m.visible) continue;
      m.position.x += dt * 0.55;
      if (m.position.x > 70) m.position.x = -70;
    }
  }

  dispose(): void {
    this.nebulaMat.dispose();
    this.nebula.geometry.dispose();
    for (const l of this.starLayers) {
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    }
    this.planetGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (m.material as THREE.Material).dispose();
    });
    for (const a of this.asteroids) {
      a.mesh.geometry.dispose();
      (a.mesh.material as THREE.Material).dispose();
    }
    this.dust.geometry.dispose();
    (this.dust.material as THREE.Material).dispose();
    for (const s of this.motherships) {
      s.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
    }
  }
}
