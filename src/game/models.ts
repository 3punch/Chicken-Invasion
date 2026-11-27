/**
 * Procedural model library — all ships, enemies and bosses are built from
 * layered lathes, extrusions, tubes and shaped plates (no placeholder cubes).
 * Each builder returns the root group plus named refs used for animation.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ */
/* Material helpers                                                     */
/* ------------------------------------------------------------------ */

export interface MatSet {
  hull: THREE.MeshStandardMaterial;
  hullDark: THREE.MeshStandardMaterial;
  organic: THREE.MeshStandardMaterial;
  glow: (color: number, intensity?: number) => THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
}

export const makeMat = (
  color: number,
  emissive = 0x000000,
  emissiveIntensity = 0,
  metalness = 0.15,
  roughness = 0.55,
): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, metalness, roughness });

const glowMatCache = new Map<string, THREE.MeshStandardMaterial>();
export const glowMat = (color: number, intensity = 2.4, base = 0x101018): THREE.MeshStandardMaterial => {
  const key = `${color}|${intensity}|${base}`;
  let m = glowMatCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: base,
      emissive: color,
      emissiveIntensity: intensity,
      metalness: 0.1,
      roughness: 0.4,
    });
    glowMatCache.set(key, m);
  }
  return m;
};

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                     */
/* ------------------------------------------------------------------ */

/** Rounded, beveled slab via extrusion — used for armor plates and wings. */
export const plateGeo = (w: number, h: number, d: number, r = 0.12): THREE.ExtrudeGeometry => {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2.2, h / 2.2);
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr);
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  return new THREE.ExtrudeGeometry(s, {
    depth: d,
    bevelEnabled: true,
    bevelThickness: d * 0.28,
    bevelSize: Math.min(0.06, d * 0.3),
    bevelSegments: 2,
    curveSegments: 6,
  }).translate(0, 0, -d / 2);
};

/** Organic tendril / spine tube along a curve. */
export const tendrilGeo = (
  pts: THREE.Vector3[],
  radius: number,
  radial = 7,
  tubular = 18,
): THREE.TubeGeometry =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), tubular, radius, radial, false);

/** Lathe a profile around Y (then callers rotate to taste). */
export const latheGeo = (profile: [number, number][], segments = 20): THREE.LatheGeometry =>
  new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)),
    segments,
  );

/** Merge geometries that share a material into one mesh. */
export const mergeMesh = (geos: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh => {
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(nonIndexed, false) ?? nonIndexed[0];
  for (const g of nonIndexed) if (!geos.includes(g)) g.dispose();
  return new THREE.Mesh(merged, material);
};

/** Comb silhouette (scalloped) for extrusion — chicken signature. */
const combShape = (scale = 1): THREE.Shape => {
  const s = new THREE.Shape();
  s.moveTo(-0.5 * scale, 0);
  for (let i = 0; i < 3; i++) {
    const x0 = (-0.5 + i * 0.36) * scale;
    s.quadraticCurveTo(x0 + 0.1 * scale, 0.62 * scale, x0 + 0.28 * scale, 0.16 * scale);
    if (i < 2) s.lineTo(x0 + 0.36 * scale, 0.06 * scale);
  }
  s.lineTo(0.62 * scale, 0);
  s.lineTo(-0.5 * scale, 0);
  return s;
};

/** Swept wing silhouette (one side). */
const wingShape = (span: number, root: number, tip: number, sweep: number): THREE.Shape => {
  const s = new THREE.Shape();
  s.moveTo(0, root / 2);
  s.quadraticCurveTo(span * 0.45, root * 0.42, span, tip / 2 - sweep);
  s.quadraticCurveTo(span * 1.06, -sweep, span * 0.92, -tip / 2 - sweep);
  s.quadraticCurveTo(span * 0.4, -root * 0.52, 0, -root / 2);
  s.lineTo(0, root / 2);
  return s;
};

/** Feather silhouette for tails. */
const featherShape = (len: number, wid: number): THREE.Shape => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(wid * 0.7, len * 0.32, wid * 0.22, len * 0.92);
  s.quadraticCurveTo(0, len, -wid * 0.22, len * 0.92);
  s.quadraticCurveTo(-wid * 0.7, len * 0.32, 0, 0);
  return s;
};

const extrudeFlat = (shape: THREE.Shape, depth: number): THREE.ExtrudeGeometry =>
  new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.35,
    bevelSize: depth * 0.35,
    bevelSegments: 1,
    curveSegments: 10,
  });

/* ------------------------------------------------------------------ */
/* THE LIVING SHIP                                                      */
/* ------------------------------------------------------------------ */

export interface LivingShip {
  group: THREE.Group;
  body: THREE.Group;
  wings: THREE.Group;
  engines: THREE.Group;
  veins: THREE.Group;
  spines: THREE.Group;
  crown: THREE.Group;
  bladeWings: THREE.Group;
  orbiters: THREE.Group;
  heart: THREE.Group;
  dnaFire: THREE.Group;
  dnaPlasma: THREE.Group;
  dnaIce: THREE.Group;
  dnaElectric: THREE.Group;
  engineFlames: THREE.Mesh[];
  orbiterMotes: THREE.Mesh[];
  heartCore: THREE.Mesh;
  veinMats: THREE.MeshStandardMaterial[];
  allMats: THREE.MeshStandardMaterial[];
}

export function buildLivingShip(): LivingShip {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const wings = new THREE.Group();
  const engines = new THREE.Group();
  const allMats: THREE.MeshStandardMaterial[] = [];
  const veinMats: THREE.MeshStandardMaterial[] = [];

  const hull = makeMat(0x8f9fc8, 0x0a1430, 0.35, 0.72, 0.38);
  const hullDark = makeMat(0x2a2f52, 0x06081a, 0.3, 0.85, 0.3);
  const organic = makeMat(0x6b4fd8, 0x2a1a8a, 0.65, 0.25, 0.52);
  const organicDeep = makeMat(0x3c2a92, 0x1a0f5a, 0.55, 0.3, 0.55);
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x113a66,
    emissive: 0x2fd8ff,
    emissiveIntensity: 1.1,
    metalness: 0.1,
    roughness: 0.12,
    transmission: 0.35,
    thickness: 0.6,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
  });
  allMats.push(hull, hullDark, organic, organicDeep, canopyMat);
  for (const m of allMats) m.userData.baseEmissiveIntensity = m.emissiveIntensity;

  // ---- fuselage: lathe spindle, nose toward -Z ----
  const fuseProfile: [number, number][] = [
    [0.02, 0],
    [0.34, 0.12],
    [0.56, 0.55],
    [0.72, 1.15],
    [0.78, 1.75],
    [0.66, 2.4],
    [0.46, 3.05],
    [0.24, 3.55],
    [0.06, 3.9],
    [0.01, 4.0],
  ];
  const fuse = new THREE.Mesh(latheGeo(fuseProfile, 26), hull);
  fuse.geometry.rotateX(-Math.PI / 2); // +Y -> -Z (nose at -Z)
  fuse.geometry.scale(1, 1.05, 1.0);
  body.add(fuse);

  // belly keel
  const keel = new THREE.Mesh(plateGeo(0.5, 3.2, 0.28, 0.14), hullDark);
  keel.geometry.rotateX(-Math.PI / 2);
  keel.position.set(0, -0.62, -0.15);
  body.add(keel);

  // canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), canopyMat);
  canopy.scale.set(0.85, 0.62, 1.55);
  canopy.position.set(0, 0.52, -1.32);
  body.add(canopy);

  // side intake ridges (three per side)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const ridge = new THREE.Mesh(plateGeo(0.12, 1.5, 0.2, 0.05), hullDark);
      ridge.geometry.rotateX(-Math.PI / 2);
      ridge.position.set(side * (0.62 + i * 0.05), 0.16 - i * 0.12, -0.35 + i * 0.22);
      ridge.rotation.y = side * 0.12;
      body.add(ridge);
    }
  }

  // ---- wings (swept extrusions) ----
  const wingGeo = extrudeFlat(wingShape(2.9, 1.5, 0.62, 1.25), 0.16);
  wingGeo.rotateX(-Math.PI / 2); // shape lies flat in XZ
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, hull);
    w.scale.x = side;
    w.position.set(side * 0.55, -0.08, -0.28);
    wings.add(w);
    // wing-tip glow strip
    const strip = new THREE.Mesh(plateGeo(0.2, 2.2, 0.06, 0.03), glowMat(0x35e0ff, 2.2));
    strip.geometry.rotateX(-Math.PI / 2);
    strip.position.set(side * 2.52, 0.02, 0.62);
    strip.rotation.y = side * 0.62;
    wings.add(strip);
  }

  // ---- engines ----
  const engineFlames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const nac = new THREE.Mesh(latheGeo([[0.02, 0], [0.36, 0.1], [0.44, 0.5], [0.4, 1.1], [0.3, 1.5], [0.22, 1.62], [0.01, 1.66]], 18), hullDark);
    nac.geometry.rotateX(Math.PI / 2); // axis along +Z, nozzle at back (+Z)
    nac.position.set(side * 1.05, -0.02, -0.35);
    engines.add(nac);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 8, 18), glowMat(0x2fd8ff, 2.8));
    ring.position.set(side * 1.05, -0.02, 1.32);
    engines.add(ring);
    const flame = new THREE.Mesh(
      latheGeo([[0.01, 0], [0.3, 0.25], [0.24, 0.8], [0.1, 1.35], [0.01, 1.7]], 12),
      new THREE.MeshBasicMaterial({
        color: 0x49e8ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    flame.geometry.rotateX(Math.PI / 2);
    flame.position.set(side * 1.05, -0.02, 1.3);
    engineFlames.push(flame);
    engines.add(flame);
  }
  // center engine
  const cRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 16), glowMat(0x2fd8ff, 2.6));
  cRing.position.set(0, -0.35, 1.42);
  engines.add(cRing);

  // ---- evolution: veins (level 2) ----
  const veins = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z0 = -1.9 + Math.floor(i / 2) * 1.35;
    const t = tendrilGeo(
      [
        new THREE.Vector3(side * 0.18, 0.62, z0),
        new THREE.Vector3(side * 0.52, 0.86, z0 + 0.45),
        new THREE.Vector3(side * 0.32, 0.72, z0 + 1.05),
        new THREE.Vector3(side * 0.12, 0.5, z0 + 1.5),
      ],
      0.055,
    );
    const vm = new THREE.MeshStandardMaterial({
      color: 0x2a1060,
      emissive: 0x8a4bff,
      emissiveIntensity: 1.6,
      metalness: 0.1,
      roughness: 0.45,
    });
    veinMats.push(vm);
    veins.add(new THREE.Mesh(t, vm));
  }
  veins.visible = false;

  // ---- evolution: spines (level 2/3) ----
  const spines = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const z = -1.55 + i * 0.78;
    const h = 0.95 + Math.sin(i * 1.7) * 0.28;
    const t = tendrilGeo(
      [
        new THREE.Vector3(0, 0.62, z),
        new THREE.Vector3((i % 2 ? 0.09 : -0.09), 0.62 + h * 0.5, z + 0.16),
        new THREE.Vector3((i % 2 ? 0.2 : -0.2), 0.62 + h, z + 0.5),
      ],
      0.11 - i * 0.008,
      6,
      10,
    );
    const m = new THREE.Mesh(t, organic);
    spines.add(m);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glowMat(0xb06bff, 2.6));
    tip.position.set(i % 2 ? 0.2 : -0.2, 0.62 + h, z + 0.5);
    spines.add(tip);
  }
  spines.visible = false;

  // ---- evolution: crown tendrils (level 3) ----
  const crown = new THREE.Group();
  for (let i = -1; i <= 1; i++) {
    const t = tendrilGeo(
      [
        new THREE.Vector3(i * 0.42, 0.66, -2.1),
        new THREE.Vector3(i * 0.95, 1.35, -1.15),
        new THREE.Vector3(i * 1.35, 1.62, 0.15),
        new THREE.Vector3(i * 1.5, 1.25, 1.35),
      ],
      0.13 - Math.abs(i) * 0.02,
      7,
      16,
    );
    crown.add(new THREE.Mesh(t, organicDeep));
    const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), glowMat(0xff5bd8, 2.4));
    tip.position.set(i * 1.5, 1.25, 1.35);
    crown.add(tip);
  }
  crown.visible = false;

  // ---- evolution: blade wing layer (level 3) ----
  const bladeWings = new THREE.Group();
  const bladeGeo = extrudeFlat(wingShape(3.6, 1.15, 0.32, 2.1), 0.1);
  bladeGeo.rotateX(-Math.PI / 2);
  for (const side of [-1, 1]) {
    const b = new THREE.Mesh(bladeGeo, glowMat(0x7a3bff, 1.15, 0x241a52));
    b.scale.x = side;
    b.position.set(side * 0.62, 0.3, -0.5);
    bladeWings.add(b);
  }
  bladeWings.visible = false;

  // ---- evolution: orbiters (level 3) ----
  const orbiters = new THREE.Group();
  const orbiterMotes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), glowMat(0x66e0ff, 2.8));
    orbiterMotes.push(m);
    orbiters.add(m);
  }
  orbiters.visible = false;

  // ---- evolution: heart core (level 2+) ----
  const heart = new THREE.Group();
  const heartCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), glowMat(0xff3bd8, 3.0));
  heartCore.position.set(0, 0.92, -0.25);
  heart.add(heartCore);
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 8, 22), hullDark);
  cage.position.copy(heartCore.position);
  cage.rotation.x = Math.PI / 2.6;
  heart.add(cage);
  const cage2 = cage.clone();
  cage2.rotation.set(Math.PI / 2.2, 0.6, 0);
  heart.add(cage2);
  heart.visible = false;

  // ---- DNA-type accent groups ----
  const dnaFire = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const side = i < 2 ? -1 : 1;
    const z = -1.5 + (i % 2) * 1.6;
    const t = tendrilGeo(
      [
        new THREE.Vector3(side * 0.62, 0.35, z),
        new THREE.Vector3(side * 1.15, 0.75, z + 0.4),
        new THREE.Vector3(side * 1.05, 1.25, z + 0.95),
      ],
      0.09,
      6,
      10,
    );
    dnaFire.add(new THREE.Mesh(t, glowMat(0xff6a1a, 2.6, 0x401805)));
  }
  dnaFire.visible = false;

  const dnaPlasma = new THREE.Group();
  for (const side of [-1, 1]) {
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), glowMat(0xd23cff, 3.0));
    orb.position.set(side * 1.7, 0.55, -0.4);
    dnaPlasma.add(orb);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.05, 6, 18), glowMat(0xff6aff, 2.2));
    ring.position.copy(orb.position);
    ring.rotation.x = Math.PI / 2;
    dnaPlasma.add(ring);
  }
  dnaPlasma.visible = false;

  const dnaIce = new THREE.Group();
  const icePositions: [number, number, number][] = [
    [-0.7, 0.6, -1.8],
    [0.7, 0.6, -1.8],
    [-0.95, 0.35, -0.4],
    [0.95, 0.35, -0.4],
    [-0.5, 0.75, 0.6],
    [0.5, 0.75, 0.6],
  ];
  for (const [x, y, z] of icePositions) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), glowMat(0x4fc8ff, 2.4, 0x0a2038));
    c.position.set(x, y, z);
    c.scale.set(0.7, 1.5, 0.7);
    dnaIce.add(c);
  }
  dnaIce.visible = false;

  const dnaElectric = new THREE.Group();
  for (const side of [-1, 1]) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 6, 20), glowMat(0xffd21a, 2.8, 0x2a2205));
    coil.position.set(side * 1.05, -0.02, 0.62);
    coil.rotation.y = Math.PI / 2;
    dnaElectric.add(coil);
    const node = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), glowMat(0xfff7a8, 3.2));
    node.position.set(side * 1.05, 0.42, -1.1);
    dnaElectric.add(node);
  }
  dnaElectric.visible = false;

  group.add(body, wings, engines, veins, spines, crown, bladeWings, orbiters, heart, dnaFire, dnaPlasma, dnaIce, dnaElectric);

  return {
    group,
    body,
    wings,
    engines,
    veins,
    spines,
    crown,
    bladeWings,
    orbiters,
    heart,
    dnaFire,
    dnaPlasma,
    dnaIce,
    dnaElectric,
    engineFlames,
    orbiterMotes,
    heartCore,
    veinMats,
    allMats,
  };
}

/** Toggle evolution parts by level (1..4) and DNA ownership. */
export function setShipEvolution(
  ship: LivingShip,
  level: number,
  dna: { fire: number; plasma: number; ice: number; electric: number },
): void {
  ship.veins.visible = level >= 2;
  ship.heart.visible = level >= 2;
  ship.spines.visible = level >= 2;
  ship.crown.visible = level >= 3;
  ship.bladeWings.visible = level >= 3;
  ship.orbiters.visible = level >= 3;
  ship.dnaFire.visible = dna.fire > 0;
  ship.dnaPlasma.visible = dna.plasma > 0;
  ship.dnaIce.visible = dna.ice > 0;
  ship.dnaElectric.visible = dna.electric > 0;
  // Grow the ship slightly with level
  const s = 1 + (level - 1) * 0.055;
  ship.body.scale.setScalar(s);
  ship.wings.scale.setScalar(s);
}

/* ------------------------------------------------------------------ */
/* SPACE CHICKEN                                                        */
/* ------------------------------------------------------------------ */

export interface ChickenModel {
  group: THREE.Group;
  wings: THREE.Group[];
  head: THREE.Group;
  tail: THREE.Group;
  eyes: THREE.Mesh[];
  mats: THREE.MeshStandardMaterial[];
}

export function buildSpaceChicken(alien: boolean): ChickenModel {
  const group = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];

  const bodyColor = alien ? 0x7c5cd8 : 0xf2ead8;
  const featherColor = alien ? 0x9a72e8 : 0xd8c8a8;
  const combColor = alien ? 0xff3b7a : 0xe23a3a;
  const beakColor = alien ? 0xffb23a : 0xf0962e;

  const bodyMat = makeMat(bodyColor, alien ? 0x2a1470 : 0x2a2418, alien ? 0.5 : 0.12, 0.12, 0.6);
  const featherMat = makeMat(featherColor, alien ? 0x3a1a90 : 0x332a18, alien ? 0.45 : 0.1, 0.1, 0.62);
  const combMat = makeMat(combColor, alien ? 0xaa1050 : 0x8a1010, alien ? 1.3 : 0.5, 0.05, 0.5);
  const beakMat = makeMat(beakColor, alien ? 0x8a4a10 : 0x6a4210, 0.35, 0.1, 0.42);
  const darkMat = makeMat(0x241a28, 0x000000, 0, 0.2, 0.7);
  mats.push(bodyMat, featherMat, combMat, beakMat, darkMat);

  // body: teardrop lathe
  const bodyGeo = latheGeo(
    [
      [0.02, -1.35],
      [0.55, -1.18],
      [0.92, -0.62],
      [1.08, 0.05],
      [1.02, 0.72],
      [0.78, 1.22],
      [0.42, 1.55],
      [0.02, 1.68],
    ],
    20,
  );
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.x = Math.PI / 2 + 0.28; // lie nose-forward (-Z), slight upright
  body.scale.set(1, 1.12, 0.95);
  group.add(body);

  // feather plates (two side rows + chest)
  const featherGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const g = plateGeo(0.72, 1.05, 0.12, 0.22);
      g.rotateY(side * 0.75);
      g.rotateX(-0.25);
      g.translate(side * (0.82 - i * 0.1), -0.12 + i * 0.28, 0.42 + i * 0.42);
      featherGeos.push(g);
    }
  }
  const chest = plateGeo(1.35, 1.35, 0.12, 0.5);
  chest.rotateX(0.32);
  chest.translate(0, -0.55, -0.42);
  featherGeos.push(chest);
  group.add(mergeMesh(featherGeos, featherMat));

  // head group (animatable)
  const head = new THREE.Group();
  head.position.set(0, 1.08, -1.22);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), bodyMat);
  skull.scale.set(1, 1.02, 1.1);
  head.add(skull);

  // beak
  const beakGeo = latheGeo([[0.01, 0], [0.16, 0.06], [0.24, 0.28], [0.16, 0.52], [0.01, 0.62]], 10);
  const beak = new THREE.Mesh(beakGeo, beakMat);
  beak.geometry.rotateX(-Math.PI / 2);
  beak.position.set(0, -0.06, -0.5);
  head.add(beak);

  // comb (extruded scallops)
  const combG = extrudeFlat(combShape(1.15), 0.1);
  combG.rotateY(Math.PI / 2);
  const comb = new THREE.Mesh(combG, combMat);
  comb.position.set(0, 0.52, -0.12);
  comb.rotation.x = -0.28;
  head.add(comb);

  // wattles
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), combMat);
    w.position.set(side * 0.13, -0.42, -0.42);
    w.scale.set(0.75, 1.35, 0.75);
    head.add(w);
  }

  // eyes (white + pupil + glow ring for aliens)
  const eyes: THREE.Mesh[] = [];
  const eyeWhite = makeMat(0xf8f4e8, 0x222222, 0.1, 0, 0.3);
  mats.push(eyeWhite);
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), eyeWhite);
    e.position.set(side * 0.31, 0.12, -0.42);
    head.add(e);
    eyes.push(e);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), darkMat);
    pupil.position.set(side * 0.355, 0.12, -0.545);
    head.add(pupil);
    if (alien) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 6, 14), glowMat(0x52ff9a, 2.8));
      ring.position.copy(e.position).z -= 0.14;
      ring.rotation.y = side * 0.55;
      head.add(ring);
    }
  }
  group.add(head);

  // wings (flapping groups)
  const wings: THREE.Group[] = [];
  const wGeo = extrudeFlat(featherShape(1.75, 1.05), 0.11);
  wGeo.rotateX(-Math.PI / 2);
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.88, 0.35, -0.18);
    const w = new THREE.Mesh(wGeo, featherMat);
    w.scale.x = side;
    w.rotation.y = side * -0.38;
    pivot.add(w);
    group.add(pivot);
    wings.push(pivot);
  }

  // tail feathers
  const tail = new THREE.Group();
  tail.position.set(0, 0.42, 1.18);
  const tGeo = extrudeFlat(featherShape(1.75, 0.82), 0.09);
  tGeo.rotateX(-Math.PI / 2);
  for (let i = -1; i <= 1; i++) {
    const f = new THREE.Mesh(tGeo, featherMat);
    f.position.set(i * 0.34, 0.12, 0.12);
    f.rotation.set(0.5, 0, i * 0.42);
    tail.add(f);
  }
  group.add(tail);

  // feet tuck
  const footG = new THREE.CylinderGeometry(0.07, 0.055, 0.85, 6).rotateX(1.15);
  const feet = mergeMesh([footG.clone().translate(-0.3, -0.85, -0.28), footG.clone().translate(0.3, -0.85, -0.28)], beakMat);
  group.add(feet);

  // alien tech collar
  if (alien) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.07, 6, 16), glowMat(0x52ff9a, 2.2));
    collar.position.set(0, 0.62, -0.86);
    collar.rotation.x = Math.PI / 2.3;
    group.add(collar);
  }

  return { group, wings, head, tail, eyes, mats };
}

/* ------------------------------------------------------------------ */
/* ARMORED DUCK                                                         */
/* ------------------------------------------------------------------ */

export interface DuckModel {
  group: THREE.Group;
  plates: THREE.Mesh[];
  head: THREE.Group;
  body: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
}

export function buildArmoredDuck(scale = 1): DuckModel {
  const group = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];

  const duckMat = makeMat(0xb8c2dc, 0x1c2848, 0.42, 0.22, 0.52);
  const armorMat = makeMat(0x6a76a8, 0x14204a, 0.55, 0.82, 0.36);
  const armorTrim = makeMat(0x4a5488, 0x2a3a8a, 1.15, 0.8, 0.32);
  const billMat = makeMat(0xf0a23a, 0x7a4a10, 0.5, 0.1, 0.45);
  const darkMat = makeMat(0x1c1830, 0x000000, 0, 0.3, 0.72);
  mats.push(duckMat, armorMat, armorTrim, billMat, darkMat);

  const body = new THREE.Group();
  const bodyGeo = latheGeo(
    [
      [0.02, -1.5],
      [0.85, -1.3],
      [1.38, -0.55],
      [1.52, 0.3],
      [1.36, 1.1],
      [0.96, 1.65],
      [0.42, 1.98],
      [0.02, 2.1],
    ],
    22,
  );
  const core = new THREE.Mesh(bodyGeo, duckMat);
  core.rotation.x = Math.PI / 2 + 0.22;
  core.scale.set(1.05, 1.18, 1);
  body.add(core);
  group.add(body);

  // armor plates: chest slab on top + shoulder pauldrons + belt
  const plates: THREE.Mesh[] = [];
  const chest = new THREE.Mesh(plateGeo(2.35, 2.2, 0.34, 0.3), armorMat);
  chest.rotation.x = -0.18;
  chest.position.set(0, 1.02, -0.35);
  body.add(chest);
  plates.push(chest);

  // glowing trim slot on the chest
  const slot = new THREE.Mesh(plateGeo(1.5, 0.22, 0.12, 0.08), glowMat(0x35c8ff, 2.0));
  slot.rotation.x = -0.18;
  slot.position.set(0, 1.28, -0.5);
  body.add(slot);

  for (const side of [-1, 1]) {
    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.78, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2.15), armorMat);
    pauldron.position.set(side * 1.42, 0.42, -0.05);
    pauldron.rotation.set(0, 0, side * -0.85);
    body.add(pauldron);
    plates.push(pauldron);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.1, 6, 16, Math.PI), armorTrim);
    trim.position.copy(pauldron.position);
    trim.rotation.set(Math.PI / 2, 0, side * -0.85);
    body.add(trim);
  }

  const belt = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.18, 8, 22), armorTrim);
  belt.rotation.x = Math.PI / 2.25;
  belt.position.set(0, -0.42, 0.35);
  body.add(belt);

  // rivets
  const rivetG = new THREE.SphereGeometry(0.09, 6, 5);
  const rivets: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    rivets.push(rivetG.clone().translate(Math.cos(a) * 1.06, 1.1 + Math.sin(a) * 0.78, -0.35));
  }
  body.add(mergeMesh(rivets, armorTrim));

  // head — raised and forward so it reads clearly from top-down
  const head = new THREE.Group();
  head.position.set(0, 1.72, -1.38);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 12), duckMat);
  skull.scale.set(1, 0.95, 1.12);
  head.add(skull);

  // bill (flat rounded extrusion)
  const billShape = new THREE.Shape();
  billShape.moveTo(-0.42, 0);
  billShape.quadraticCurveTo(-0.5, -0.34, -0.3, -0.42);
  billShape.lineTo(0.3, -0.42);
  billShape.quadraticCurveTo(0.5, -0.34, 0.42, 0);
  billShape.lineTo(-0.42, 0);
  const bill = new THREE.Mesh(extrudeFlat(billShape, 0.42), billMat);
  bill.rotation.set(-Math.PI / 2 + 0.25, 0, 0);
  bill.position.set(0, -0.12, -0.6);
  head.add(bill);

  // helmet dome + brim
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.86, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), armorMat);
  helmet.position.set(0, 0.12, 0.08);
  head.add(helmet);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.11, 6, 18), armorTrim);
  brim.position.copy(helmet.position);
  brim.rotation.x = Math.PI / 2;
  head.add(brim);
  const fin = new THREE.Mesh(plateGeo(0.16, 0.85, 0.5, 0.06), armorTrim);
  fin.position.set(0, 0.86, 0.1);
  head.add(fin);

  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), makeMat(0x101018, 0xff8a2a, 1.6, 0.1, 0.3));
    e.position.set(side * 0.38, -0.02, -0.58);
    head.add(e);
  }
  group.add(head);

  // stub wings
  const wGeo = extrudeFlat(featherShape(1.2, 0.9), 0.14);
  wGeo.rotateX(-Math.PI / 2);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(wGeo, duckMat);
    w.scale.x = side;
    w.position.set(side * 1.32, 0.12, 0.32);
    w.rotation.set(0.25, side * -0.5, 0);
    group.add(w);
  }

  group.scale.setScalar(scale);
  return { group, plates, head, body, mats };
}

/* ------------------------------------------------------------------ */
/* ROCKET CHICKEN                                                       */
/* ------------------------------------------------------------------ */

export interface RocketChickenModel {
  group: THREE.Group;
  flame: THREE.Mesh;
  head: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
}

export function buildRocketChicken(): RocketChickenModel {
  const group = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const hullMat = makeMat(0xd8483c, 0x5a0f0a, 0.55, 0.7, 0.32);
  const trimMat = makeMat(0xf0e6d8, 0x332a22, 0.3, 0.45, 0.4);
  const darkMat = makeMat(0x2a1c22, 0x000000, 0, 0.5, 0.6);
  mats.push(hullMat, trimMat, darkMat);

  // missile fuselage (nose -Z)
  const fuse = new THREE.Mesh(
    latheGeo([[0.02, 0], [0.3, 0.18], [0.52, 0.8], [0.58, 1.7], [0.5, 2.6], [0.3, 3.3], [0.1, 3.75], [0.01, 3.9]], 18),
    hullMat,
  );
  fuse.geometry.rotateX(-Math.PI / 2);
  group.add(fuse);

  // trim bands
  for (const z of [-1.4, -0.2, 1.0]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.55 - Math.abs(z) * 0.07, 0.08, 6, 16), trimMat);
    band.position.set(0, 0, z);
    group.add(band);
  }

  // fins
  const finGeo = extrudeFlat(wingShape(1.5, 1.25, 0.5, 1.15), 0.1);
  finGeo.rotateX(-Math.PI / 2);
  for (const side of [-1, 1]) {
    const f = new THREE.Mesh(finGeo, hullMat);
    f.scale.x = side;
    f.position.set(side * 0.3, -0.1, 1.05);
    group.add(f);
  }
  const vFin = new THREE.Mesh(extrudeFlat(featherShape(1.4, 0.8), 0.1), trimMat);
  vFin.rotation.set(-Math.PI / 2, 0, 0);
  vFin.position.set(0, 0.42, 1.35);
  group.add(vFin);

  // little chicken head on the nose
  const head = new THREE.Group();
  head.position.set(0, 0.22, -1.9);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), trimMat);
  skull.scale.set(1, 0.95, 1.15);
  head.add(skull);
  const beak = new THREE.Mesh(latheGeo([[0.01, 0], [0.12, 0.05], [0.16, 0.2], [0.1, 0.38], [0.01, 0.44]], 8), makeMat(0xf0962e, 0x6a4210, 0.4, 0.1, 0.4));
  beak.geometry.rotateX(-Math.PI / 2);
  beak.position.set(0, -0.04, -0.36);
  head.add(beak);
  const comb = new THREE.Mesh(extrudeFlat(combShape(0.62), 0.07), makeMat(0xe23a3a, 0x8a1010, 0.6, 0.05, 0.5));
  comb.rotation.y = Math.PI / 2;
  comb.position.set(0, 0.32, -0.05);
  head.add(comb);
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glowMat(0xffd21a, 2.6, 0x201805));
    e.position.set(side * 0.2, 0.08, -0.3);
    head.add(e);
  }
  group.add(head);

  // engine flame
  const flame = new THREE.Mesh(
    latheGeo([[0.01, 0], [0.34, 0.3], [0.28, 0.9], [0.14, 1.5], [0.01, 1.95]], 12),
    new THREE.MeshBasicMaterial({
      color: 0xffa23a,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  flame.geometry.rotateX(Math.PI / 2);
  flame.position.set(0, 0, 1.85);
  group.add(flame);

  return { group, flame, head, mats };
}

/* ------------------------------------------------------------------ */
/* ALIEN EGG                                                            */
/* ------------------------------------------------------------------ */

export interface EggModel {
  group: THREE.Group;
  shell: THREE.Mesh;
  cracks: THREE.Mesh[];
  aura: THREE.Mesh;
  mats: THREE.MeshStandardMaterial[];
}

export function buildAlienEgg(): EggModel {
  const group = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];

  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xcfc2e8,
    emissive: 0x4a2a8a,
    emissiveIntensity: 0.55,
    metalness: 0.18,
    roughness: 0.42,
    flatShading: false,
  });
  mats.push(shellMat);

  const shell = new THREE.Mesh(latheGeo([[0.02, -1.5], [0.72, -1.32], [1.18, -0.62], [1.3, 0.2], [1.12, 1.02], [0.72, 1.6], [0.3, 1.92], [0.02, 2.05]], 24), shellMat);
  group.add(shell);

  // glowing crack veins (tubes hugging the shell)
  const cracks: THREE.Mesh[] = [];
  const crackMat = glowMat(0xff4ad8, 2.6, 0x1a0530);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const t = tendrilGeo(
      [
        new THREE.Vector3(Math.cos(a) * 0.5, -1.1, Math.sin(a) * 0.5),
        new THREE.Vector3(Math.cos(a + 0.5) * 1.12, -0.25, Math.sin(a + 0.5) * 1.12),
        new THREE.Vector3(Math.cos(a - 0.4) * 1.08, 0.55, Math.sin(a - 0.4) * 1.08),
        new THREE.Vector3(Math.cos(a + 0.2) * 0.55, 1.45, Math.sin(a + 0.2) * 0.55),
      ],
      0.045,
      5,
      12,
    );
    const m = new THREE.Mesh(t, crackMat);
    cracks.push(m);
    group.add(m);
  }

  // pulsing aura shell
  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(1.55, 18, 12),
    new THREE.MeshBasicMaterial({
      color: 0xb04aff,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  aura.scale.set(1, 1.32, 1);
  group.add(aura);

  return { group, shell, cracks, aura, mats };
}

/* ------------------------------------------------------------------ */
/* MINI-BOSS: the Iron Duke (command duck)                              */
/* ------------------------------------------------------------------ */

export interface MiniBossModel {
  group: THREE.Group;
  duck: DuckModel;
  cannons: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
}

export function buildMiniBoss(): MiniBossModel {
  const duck = buildArmoredDuck(2.35);
  const group = new THREE.Group();
  group.add(duck.group);

  // extra command armor: back cannon rack
  const cannons = new THREE.Group();
  const barrelMat = makeMat(0x3a4268, 0x101a44, 0.7, 0.9, 0.28);
  duck.mats.push(barrelMat);
  for (const side of [-1, 1]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 2.2, 10).rotateX(Math.PI / 2), barrelMat);
    barrel.position.set(side * 1.15, 1.9, -0.6);
    cannons.add(barrel);
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 6, 14), glowMat(0xff5a2a, 2.6));
    glowRing.position.set(side * 1.15, 1.9, -1.72);
    cannons.add(glowRing);
  }
  group.add(cannons);

  return { group, duck, cannons, mats: duck.mats };
}

/* ------------------------------------------------------------------ */
/* FINAL BOSS: THE CHICKEN OVERLORD                                     */
/* ------------------------------------------------------------------ */

export interface BossModel {
  group: THREE.Group;
  core: THREE.Group;
  wingPylons: THREE.Group[];
  cannons: THREE.Group;
  crown: THREE.Group;
  aura: THREE.Group;
  eyes: THREE.Mesh[];
  engineFlames: THREE.Mesh[];
  mats: THREE.MeshStandardMaterial[];
  auraMat: THREE.MeshBasicMaterial;
}

export function buildChickenOverlord(): BossModel {
  const group = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];

  const bodyMat = makeMat(0x8a52b8, 0x3a1270, 0.95, 0.35, 0.42);
  const armorMat = makeMat(0x3c2e6a, 0x1a1038, 0.85, 0.9, 0.28);
  const trimMat = makeMat(0xffc23a, 0x8a5a10, 1.9, 0.85, 0.28);
  const fleshMat = makeMat(0xb05ae8, 0x5a18b0, 1.15, 0.15, 0.5);
  mats.push(bodyMat, armorMat, trimMat, fleshMat);

  const core = new THREE.Group();

  // massive body
  const bodyGeo = latheGeo(
    [
      [0.02, -3.2],
      [1.6, -2.85],
      [2.7, -1.5],
      [3.1, 0.3],
      [2.8, 2.1],
      [2.0, 3.4],
      [1.0, 4.2],
      [0.02, 4.5],
    ],
    26,
  );
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.x = Math.PI / 2 + 0.22;
  core.add(body);

  // chest armor
  const chest = new THREE.Mesh(plateGeo(4.6, 4.2, 0.75, 0.6), armorMat);
  chest.rotation.x = -0.38;
  chest.position.set(0, 0.55, -1.75);
  core.add(chest);
  const emblem = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.28, 8, 22), trimMat);
  emblem.position.set(0, 0.72, -2.32);
  emblem.rotation.x = -0.38;
  core.add(emblem);
  const emblemCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 1), glowMat(0xff2a8a, 3.2));
  emblemCore.position.set(0, 0.72, -2.42);
  core.add(emblemCore);

  // shoulder pauldrons
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(1.75, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), armorMat);
    p.position.set(side * 2.85, 1.5, -0.3);
    p.rotation.z = side * -0.75;
    core.add(p);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.5, 8), trimMat);
    spike.position.set(side * 3.6, 2.35, -0.3);
    spike.rotation.z = side * -0.95;
    core.add(spike);
  }

  // head
  const head = new THREE.Group();
  head.position.set(0, 3.9, -2.6);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1.65, 20, 16), bodyMat);
  skull.scale.set(1, 1.05, 1.18);
  head.add(skull);

  const beak = new THREE.Mesh(latheGeo([[0.01, 0], [0.42, 0.18], [0.62, 0.72], [0.42, 1.35], [0.01, 1.62]], 12), trimMat);
  beak.geometry.rotateX(-Math.PI / 2);
  beak.position.set(0, -0.18, -1.28);
  head.add(beak);

  // crown of blades
  const crown = new THREE.Group();
  for (let i = -2; i <= 2; i++) {
    const blade = new THREE.Mesh(extrudeFlat(combShape(1.5 - Math.abs(i) * 0.18), 0.22), trimMat);
    blade.rotation.y = Math.PI / 2;
    blade.rotation.x = -0.32;
    blade.position.set(0, 1.28 + Math.abs(i) * -0.16, -0.1 + i * 0.62);
    crown.add(blade);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), glowMat(0xff2a8a, 2.8));
    tip.position.set(0, 2.35 - Math.abs(i) * 0.22, -0.1 + i * 0.62);
    crown.add(tip);
  }
  head.add(crown);

  // eyes: menacing glowing
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 10), armorMat);
    socket.position.set(side * 0.82, 0.32, -1.18);
    head.add(socket);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), glowMat(0xffe23a, 3.4, 0x302205));
    e.position.set(side * 0.88, 0.32, -1.42);
    head.add(e);
    eyes.push(e);
    const brow = new THREE.Mesh(plateGeo(0.95, 0.28, 0.22, 0.1), armorMat);
    brow.position.set(side * 0.85, 0.85, -1.3);
    brow.rotation.z = side * -0.42;
    head.add(brow);
  }
  core.add(head);

  // wattles (organic)
  const wattle = new THREE.Mesh(latheGeo([[0.01, 0], [0.5, -0.3], [0.62, -1.1], [0.3, -1.8], [0.01, -2.0]], 10), fleshMat);
  wattle.position.set(0, -0.25, -2.35);
  core.add(wattle);

  group.add(core);

  // wing pylons (mechanical wings with engines)
  const wingPylons: THREE.Group[] = [];
  const engineFlames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const pylon = new THREE.Group();
    pylon.position.set(side * 3.2, 0.85, 0.35);
    const wing = new THREE.Mesh(extrudeFlat(wingShape(6.2, 3.4, 1.15, 3.1), 0.42), armorMat);
    wing.rotation.x = -Math.PI / 2;
    wing.scale.x = side;
    pylon.add(wing);
    const glowStrip = new THREE.Mesh(plateGeo(0.34, 3.6, 0.14, 0.08), glowMat(0xff2a8a, 2.0));
    glowStrip.rotation.x = -Math.PI / 2;
    glowStrip.position.set(side * 3.5, 0.28, 1.35);
    glowStrip.rotation.y = side * 0.55;
    pylon.add(glowStrip);
    for (let e = 0; e < 2; e++) {
      const pod = new THREE.Mesh(latheGeo([[0.02, 0], [0.55, 0.3], [0.72, 1.1], [0.6, 2.0], [0.38, 2.5], [0.02, 2.65]], 12), armorMat);
      pod.geometry.rotateX(Math.PI / 2);
      pod.position.set(side * (2.6 + e * 1.9), -0.3, 1.2 + e * 1.15);
      pylon.add(pod);
      const podRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.12, 6, 16), glowMat(0xff2a8a, 2.6));
      podRing.position.copy(pod.position).z += 2.55;
      pylon.add(podRing);
      const flame = new THREE.Mesh(
        latheGeo([[0.01, 0], [0.5, 0.5], [0.38, 1.4], [0.18, 2.2], [0.01, 2.8]], 10),
        new THREE.MeshBasicMaterial({
          color: 0xff5a2a,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      flame.geometry.rotateX(Math.PI / 2);
      flame.position.copy(pod.position).z += 2.6;
      engineFlames.push(flame);
      pylon.add(flame);
    }
    group.add(pylon);
    wingPylons.push(pylon);
  }

  // shoulder cannons
  const cannons = new THREE.Group();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 2.6, 10).rotateX(Math.PI / 2), armorMat);
      barrel.position.set(side * (1.7 + i * 1.05), 2.6, -1.1);
      cannons.add(barrel);
      const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.11, 6, 14), glowMat(0xff2a8a, 2.8));
      glowRing.position.set(side * (1.7 + i * 1.05), 2.6, -2.42);
      cannons.add(glowRing);
    }
  }
  group.add(cannons);

  // energy aura (animated additive shells)
  const aura = new THREE.Group();
  const auraMat = new THREE.MeshBasicMaterial({
    color: 0xff2a8a,
    transparent: true,
    opacity: 0.09,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const aura1 = new THREE.Mesh(new THREE.SphereGeometry(6.4, 20, 14), auraMat);
  aura1.scale.set(1, 0.72, 1);
  aura1.position.y = 1.2;
  aura.add(aura1);
  group.add(aura);

  return { group, core, wingPylons, cannons, crown, aura, eyes, engineFlames, mats, auraMat };
}
