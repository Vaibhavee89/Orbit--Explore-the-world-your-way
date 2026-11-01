import * as THREE from 'three';

/** Shared stylized materials so prop instances are cheap and visually consistent. */
const MAT = {
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.85 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x3f2c1f, roughness: 0.9 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x4a3328, roughness: 0.8 }),
  snowRoof: new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.6 }),
  pineFoliage: new THREE.MeshStandardMaterial({ color: 0x24402b, roughness: 0.9 }),
  pineTrunk: new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.95 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.9 }),
  water: new THREE.MeshStandardMaterial({
    color: 0xaad4e8, transparent: true, opacity: 0.75, roughness: 0.2, metalness: 0.1,
  }),
  flag: new THREE.MeshStandardMaterial({ color: 0xc9a961, side: THREE.DoubleSide }),
  // Desert palette.
  sandstone: new THREE.MeshStandardMaterial({ color: 0xd9a85c, roughness: 0.92 }),
  sandstoneDark: new THREE.MeshStandardMaterial({ color: 0xb8823f, roughness: 0.9 }),
  sandstoneLight: new THREE.MeshStandardMaterial({ color: 0xe8c484, roughness: 0.85 }),
  clayWall: new THREE.MeshStandardMaterial({ color: 0xc89860, roughness: 0.95 }),
  palmTrunk: new THREE.MeshStandardMaterial({ color: 0x8a6b45, roughness: 0.9 }),
  palmFrond: new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.85, side: THREE.DoubleSide }),
  oasisWater: new THREE.MeshStandardMaterial({
    color: 0x3f8c9c, transparent: true, opacity: 0.82, roughness: 0.15, metalness: 0.25,
  }),
  ruinStone: new THREE.MeshStandardMaterial({ color: 0x9c8366, roughness: 0.95 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0xaf4c3a, roughness: 0.8, side: THREE.DoubleSide }),
  // Arctic palette.
  turf: new THREE.MeshStandardMaterial({ color: 0x4a5c3a, roughness: 0.95 }),
  nordicWall: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.85 }),
  nordicWallDark: new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.9 }),
  windowGlow: new THREE.MeshStandardMaterial({ color: 0xffcf7a, emissive: 0xffaa33, emissiveIntensity: 0.6 }),
  ice: new THREE.MeshStandardMaterial({ color: 0xcfe8f0, roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.92 }),
  basalt: new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.85 }),
  lighthouseRed: new THREE.MeshStandardMaterial({ color: 0xa83c30, roughness: 0.6 }),
  lighthouseLamp: new THREE.MeshStandardMaterial({ color: 0xfff4c0, emissive: 0xffdd77, emissiveIntensity: 1.2 }),
  dockWood: new THREE.MeshStandardMaterial({ color: 0x5c4a38, roughness: 0.9 }),
  frozenLake: new THREE.MeshStandardMaterial({ color: 0xaed4e0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.88 }),
  // Japanese palette.
  darkLacquer: new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.6 }),
  roofTile: new THREE.MeshStandardMaterial({ color: 0x3c4448, roughness: 0.7 }),
  templeRed: new THREE.MeshStandardMaterial({ color: 0xa8392c, roughness: 0.55 }),
  shojiPaper: new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.8, emissive: 0xe8c878, emissiveIntensity: 0.25 }),
  bamboo: new THREE.MeshStandardMaterial({ color: 0x8fb04a, roughness: 0.6 }),
  blossomPink: new THREE.MeshStandardMaterial({ color: 0xf3c7d6, roughness: 0.75 }),
  blossomTrunk: new THREE.MeshStandardMaterial({ color: 0x5a4336, roughness: 0.9 }),
  lanternStone: new THREE.MeshStandardMaterial({ color: 0x8a8a82, roughness: 0.85 }),
  paperLantern: new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffbb55, emissiveIntensity: 0.9 }),
  pondWater: new THREE.MeshStandardMaterial({ color: 0x4a7a6a, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }),
  // Swiss Alps palette.
  chaletWood: new THREE.MeshStandardMaterial({ color: 0x9c6f3e, roughness: 0.8 }),
  chaletTrim: new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.75 }),
  flowerRed: new THREE.MeshStandardMaterial({ color: 0xc8445a, roughness: 0.7 }),
  flowerPink: new THREE.MeshStandardMaterial({ color: 0xe27a9c, roughness: 0.7 }),
  churchStone: new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.8 }),
  churchRoof: new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.65 }),
  cableMetal: new THREE.MeshStandardMaterial({ color: 0x6a6a6e, roughness: 0.5, metalness: 0.6 }),
  gondolaRed: new THREE.MeshStandardMaterial({ color: 0xb8352a, roughness: 0.4, metalness: 0.2 }),
  turquoiseLake: new THREE.MeshStandardMaterial({ color: 0x3fb8c4, roughness: 0.1, metalness: 0.25, transparent: true, opacity: 0.85 }),
  meadowGrass: new THREE.MeshStandardMaterial({ color: 0x5c8a3a, roughness: 0.9 }),
};

function _withShadows<T extends THREE.Object3D>(obj: T): T {
  obj.traverse(c => {
    if (c instanceof THREE.Mesh) { c.castShadow = true; c.receiveShadow = true; }
  });
  return obj;
}

/** A small A-frame wooden mountain cottage, ~4m x 4m footprint, ~4m tall. */
export function buildCottage(): THREE.Group {
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 4), MAT.wood);
  base.position.y = 1.2;
  g.add(base);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.8, 4), MAT.snowRoof);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.4 + 0.9;
  g.add(roof);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.1), MAT.woodDark);
  door.position.set(0, 0.8, 2.02);
  g.add(door);

  return _withShadows(g);
}

/** A stacked-cone pine/deodar tree, randomized height for natural variety. */
export function buildPineTree(heightScale = 1): THREE.Group {
  const g = new THREE.Group();
  const trunkH = 1.2 * heightScale;

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, trunkH, 6), MAT.pineTrunk);
  trunk.position.y = trunkH / 2;
  g.add(trunk);

  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const radius = (1.6 - t * 0.9) * heightScale;
    const coneH = 1.8 * heightScale;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, coneH, 7), MAT.pineFoliage);
    cone.position.y = trunkH + i * coneH * 0.55 + coneH / 2;
    g.add(cone);
  }

  return _withShadows(g);
}

/** A short wooden plank bridge spanning `length` metres, aligned along local +Z. */
export function buildBridge(length = 6): THREE.Group {
  const g = new THREE.Group();

  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, length), MAT.wood);
  deck.position.y = 0.1;
  g.add(deck);

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, length), MAT.woodDark);
    rail.position.set(side * 1.05, 0.5, 0);
    g.add(rail);
  }

  const postCount = Math.max(2, Math.round(length / 2));
  for (let i = 0; i < postCount; i++) {
    const zz = -length / 2 + (i / (postCount - 1)) * length;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 2.4, 6), MAT.stone);
    post.position.set(0, -1.0, zz);
    g.add(post);
  }

  return _withShadows(g);
}

/** A scenic viewpoint platform with a railing and a small flag — a discoverable landmark. */
export function buildViewpoint(): THREE.Group {
  const g = new THREE.Group();

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.3, 8), MAT.wood);
  platform.position.y = 0.15;
  g.add(platform);

  const railGroup = new THREE.Group();
  const railCount = 8;
  for (let i = 0; i < railCount; i++) {
    const a = (i / railCount) * Math.PI; // half-circle facing the view
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5), MAT.woodDark);
    post.position.set(Math.cos(a) * 2.1, 0.75, Math.sin(a) * 2.1);
    railGroup.add(post);
  }
  g.add(railGroup);

  const poleHeight = 2.2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, poleHeight, 6), MAT.woodDark);
  pole.position.y = 0.3 + poleHeight / 2;
  g.add(pole);

  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), MAT.flag);
  flag.position.set(0.3, 0.3 + poleHeight - 0.3, 0);
  g.add(flag);

  return _withShadows(g);
}

/** A simplified cascading waterfall — stylized, not physically simulated. */
export function buildWaterfall(heightM = 6): THREE.Group {
  const g = new THREE.Group();

  const fall = new THREE.Mesh(new THREE.PlaneGeometry(3, heightM), MAT.water);
  fall.position.y = heightM / 2;
  g.add(fall);

  const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.3, 12), MAT.water);
  pool.position.y = 0.1;
  g.add(pool);

  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), MAT.stone);
  rock.position.set(0, heightM + 0.5, -0.3);
  rock.scale.set(1.6, 0.6, 0.8);
  g.add(rock);

  return _withShadows(g);
}

export function buildShop(): THREE.Group {
  const g = buildCottage();
  // Slightly wider, flatter roof to visually distinguish shops from cottages.
  g.scale.set(1.3, 0.9, 1.1);
  return g;
}

/** A small single-room wooden cabin, distinct from cottages — a dedicated quest location. */
export function buildCabin(): THREE.Group {
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), MAT.woodDark);
  base.position.y = 1;
  g.add(base);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.3, 4), MAT.roof);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2 + 0.65;
  g.add(roof);

  const porch = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 1.2), MAT.wood);
  porch.position.set(0, 0.1, 1.9);
  g.add(porch);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.1), MAT.woodDark);
  door.position.set(0, 0.7, 1.52);
  g.add(door);

  // Small chimney with a warm glow — reads as "lived-in" / quest marker.
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1, 0.35), MAT.stone);
  chimney.position.set(1, 2.6, -0.8);
  g.add(chimney);

  return _withShadows(g);
}

// ── Desert / fort props (Rajasthan world) ──────────────────────────────────

/** A straight fort curtain-wall segment of `length` metres, crenellated top. */
export function buildFortWall(length = 14): THREE.Group {
  const g = new THREE.Group();
  const height = 6;

  const wall = new THREE.Mesh(new THREE.BoxGeometry(length, height, 1.4), MAT.sandstone);
  wall.position.y = height / 2;
  g.add(wall);

  const crenelCount = Math.max(3, Math.round(length / 1.8));
  for (let i = 0; i < crenelCount; i++) {
    if (i % 2 !== 0) continue;
    const x = -length / 2 + (i / (crenelCount - 1)) * length;
    const crenel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 1.4), MAT.sandstoneDark);
    crenel.position.set(x, height + 0.5, 0);
    g.add(crenel);
  }

  return _withShadows(g);
}

/** A round defensive fort tower with a domed cap, ~9m tall. */
export function buildFortTower(): THREE.Group {
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 8, 12), MAT.sandstone);
  base.position.y = 4;
  g.add(base);

  const band = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.15, 0.4, 12), MAT.sandstoneDark);
  band.position.y = 6.5;
  g.add(band);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.sandstoneLight);
  dome.position.y = 8;
  g.add(dome);

  // Jharokha-style balcony window band.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const win = new THREE.Mesh(new THREE.BoxGeometry(1, 1.3, 0.3), MAT.sandstoneDark);
    win.position.set(Math.cos(a) * 3, 5, Math.sin(a) * 3);
    win.rotation.y = -a;
    g.add(win);
  }

  return _withShadows(g);
}

/** A large arched fort gateway, walkable through. */
export function buildFortGate(): THREE.Group {
  const g = new THREE.Group();

  const pillarGeo = new THREE.BoxGeometry(1.6, 7, 1.6);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, MAT.sandstone);
    pillar.position.set(side * 3, 3.5, 0);
    g.add(pillar);
  }

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.4, 1.8), MAT.sandstoneDark);
  lintel.position.y = 7.2;
  g.add(lintel);

  const archGeo = new THREE.TorusGeometry(2.6, 0.5, 8, 16, Math.PI);
  const arch = new THREE.Mesh(archGeo, MAT.sandstoneLight);
  arch.position.y = 7.2;
  arch.rotation.z = Math.PI;
  g.add(arch);

  return _withShadows(g);
}

/** A sandstone/mud desert house (haveli), distinct from the mountain cottage. */
export function buildHaveli(): THREE.Group {
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3, 4), MAT.clayWall);
  base.position.y = 1.5;
  g.add(base);

  // Flat desert roof with a low parapet, not a pitched roof.
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.4, 4.2), MAT.sandstoneDark);
  parapet.position.y = 3.2;
  g.add(parapet);

  // Jharokha balcony window.
  const balcony = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 0.3), MAT.sandstoneLight);
  balcony.position.set(0, 2, 2.05);
  g.add(balcony);

  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.1), MAT.sandstoneDark);
  door.position.set(1.2, 0.9, 2.02);
  g.add(door);

  // Colourful fabric awning over the entrance.
  const awning = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.9), MAT.fabric);
  awning.position.set(1.2, 1.9, 2.5);
  awning.rotation.x = -0.25;
  g.add(awning);

  return _withShadows(g);
}

/** A stone village well with a small roof frame — a village-centre landmark. */
export function buildWell(): THREE.Group {
  const g = new THREE.Group();

  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 1, 12), MAT.ruinStone);
  ring.position.y = 0.5;
  g.add(ring);

  const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, MAT.palmTrunk);
    post.position.set(side * 1, 1.8, 0);
    g.add(post);
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.7, 4), MAT.sandstoneDark);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.9;
  g.add(roof);

  return _withShadows(g);
}

/** A market stall with a fabric canopy — village exploration/shop location. */
export function buildMarketStall(): THREE.Group {
  const g = new THREE.Group();

  const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.2), MAT.palmTrunk);
  table.position.y = 0.4;
  g.add(table);

  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 2, 6);
  for (const [sx, sz] of [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]] as [number, number][]) {
    const post = new THREE.Mesh(postGeo, MAT.woodDark);
    post.position.set(sx, 1.8, sz);
    g.add(post);
  }

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 1.6), MAT.fabric);
  canopy.position.y = 2.8;
  g.add(canopy);

  return _withShadows(g);
}

/** A palm tree for the oasis, randomized lean/height for natural variety. */
export function buildPalmTree(heightScale = 1): THREE.Group {
  const g = new THREE.Group();
  const trunkH = 4.5 * heightScale;

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, trunkH, 6), MAT.palmTrunk);
  trunk.position.y = trunkH / 2;
  trunk.rotation.z = 0.08;
  g.add(trunk);

  const frondCount = 7;
  for (let i = 0; i < frondCount; i++) {
    const a = (i / frondCount) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.25, 2.6, 4), MAT.palmFrond);
    frond.position.set(Math.cos(a) * 0.3, trunkH + 0.2, Math.sin(a) * 0.3);
    frond.rotation.x = Math.PI / 2.3;
    frond.rotation.y = a;
    g.add(frond);
  }

  return _withShadows(g);
}

/** Half-buried ancient ruins — a discoverable landmark, not a solid structure. */
export function buildRuins(): THREE.Group {
  const g = new THREE.Group();

  const pillar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 3, 8), MAT.ruinStone);
  pillar1.position.set(-1.4, 1.2, 0);
  pillar1.rotation.z = 0.15;
  g.add(pillar1);

  const pillar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.6, 8), MAT.ruinStone);
  pillar2.position.set(1.2, 0.5, 0.6);
  pillar2.rotation.z = -0.3;
  g.add(pillar2);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 1.8), MAT.ruinStone);
  slab.position.set(0.2, 0.3, -1.2);
  slab.rotation.y = 0.4;
  slab.rotation.z = 0.1;
  g.add(slab);

  const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), MAT.ruinStone);
  rubble.position.set(-0.6, 0.25, 1);
  g.add(rubble);

  return _withShadows(g);
}

/** A still oasis water pool, ringed by a few rocks. */
export function buildOasisPool(radius = 5): THREE.Group {
  const g = new THREE.Group();

  const pool = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.92, 0.3, 16), MAT.oasisWater);
  pool.position.y = 0.05;
  g.add(pool);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + i * 0.3;
    const r = radius * (1.05 + ((i * 37) % 10) / 40);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + (i % 3) * 0.15, 0), MAT.sandstoneDark);
    rock.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r);
    g.add(rock);
  }

  return _withShadows(g);
}

/** A desert rocky outcrop — scattered environmental detail. */
export function buildDesertRock(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), MAT.sandstoneDark);
  rock.scale.set(1.4 * scale, 0.8 * scale, 1.1 * scale);
  rock.position.y = 0.3 * scale;
  g.add(rock);
  return _withShadows(g);
}

// ── Arctic / Nordic props (Iceland world) ──────────────────────────────────

/** A Nordic turf-roof house — stone/wood base, rounded grass-covered roof, glowing window. */
export function buildTurfHouse(): THREE.Group {
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 3.6), MAT.nordicWall);
  base.position.y = 1.1;
  g.add(base);

  // Rounded turf roof — half-cylinder laid along the ridge.
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 4.4, 10, 1, false, 0, Math.PI), MAT.turf);
  roof.rotation.z = Math.PI / 2;
  roof.position.y = 2.2;
  g.add(roof);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.1), MAT.nordicWallDark);
  door.position.set(0, 0.8, 1.82);
  g.add(door);

  const window = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.08), MAT.windowGlow);
  window.position.set(1.3, 1.3, 1.82);
  g.add(window);

  return _withShadows(g);
}

/** A tall red-and-white banded lighthouse with a glowing lamp room. */
export function buildLighthouse(): THREE.Group {
  const g = new THREE.Group();
  const height = 11;

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, height, 12), MAT.nordicWall);
  tower.position.y = height / 2;
  g.add(tower);

  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, 1.2, 12), MAT.lighthouseRed);
    band.position.y = 2 + i * 3.2;
    g.add(band);
  }

  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.2, 10), MAT.nordicWallDark);
  lampRoom.position.y = height + 0.6;
  g.add(lampRoom);

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), MAT.lighthouseLamp);
  lamp.position.y = height + 0.6;
  g.add(lamp);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1, 10), MAT.lighthouseRed);
  roof.position.y = height + 1.7;
  g.add(roof);

  return _withShadows(g);
}

/** A wooden fishing dock extending over the water, with support posts. */
export function buildDock(length = 10): THREE.Group {
  const g = new THREE.Group();

  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, length), MAT.dockWood);
  deck.position.y = 0.6;
  g.add(deck);

  const postCount = Math.max(3, Math.round(length / 2.5));
  for (let i = 0; i < postCount; i++) {
    const zz = -length / 2 + (i / (postCount - 1)) * length;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 6), MAT.dockWood);
      post.position.set(side * 1.1, -0.2, zz);
      g.add(post);
    }
  }

  return _withShadows(g);
}

/** An angular glacier/iceberg formation — crystalline, semi-transparent. */
export function buildIceberg(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const main = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 0), MAT.ice);
  main.scale.set(1.3 * scale, 1.6 * scale, 1.1 * scale);
  main.position.y = 1.2 * scale;
  g.add(main);

  const shard = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), MAT.ice);
  shard.scale.set(0.9 * scale, 1.3 * scale, 0.8 * scale);
  shard.position.set(1.4 * scale, 0.7 * scale, 0.4 * scale);
  g.add(shard);

  return _withShadows(g);
}

/** A cluster of hexagonal basalt columns, varying height — iconic Icelandic coastline feature. */
export function buildBasaltColumns(): THREE.Group {
  const g = new THREE.Group();
  const count = 9;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = 0.5 + (i % 3) * 0.4;
    const h = 2.4 + ((i * 37) % 10) / 10 * 2.2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, h, 6), MAT.basalt);
    col.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    g.add(col);
  }
  return _withShadows(g);
}

/** A flat frozen lake/pond surface. */
export function buildFrozenLake(radius = 6): THREE.Group {
  const g = new THREE.Group();
  const lake = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.95, 0.2, 16), MAT.frozenLake);
  lake.position.y = 0.05;
  g.add(lake);
  return _withShadows(g);
}

/** A small arctic village shop — shares the Nordic palette, distinct roofline from the turf house. */
export function buildVillageShop(): THREE.Group {
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 3), MAT.nordicWallDark);
  base.position.y = 1.3;
  g.add(base);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4), MAT.lighthouseRed);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.6 + 0.8;
  g.add(roof);

  const window = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.08), MAT.windowGlow);
  window.position.set(0, 1.5, 1.52);
  g.add(window);

  return _withShadows(g);
}

// ── Japanese / Kyoto props ───────────────────────────────────────────────────

/** A traditional wooden machiya townhouse — dark lacquered wood, tiled roof, shoji-lit window. */
export function buildMachiya(): THREE.Group {
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 3.4), MAT.darkLacquer);
  base.position.y = 1.3;
  g.add(base);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 4), MAT.roofTile);
  roof.position.y = 2.75;
  g.add(roof);
  const roofCap = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.2, 0.5), MAT.roofTile);
  roofCap.position.y = 2.95;
  g.add(roofCap);

  const window = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.08), MAT.shojiPaper);
  window.position.set(0, 1.4, 1.72);
  g.add(window);

  return _withShadows(g);
}

/** A small tea house / shop, distinct roofline from the machiya. */
export function buildTeaHouse(): THREE.Group {
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 2.6), MAT.darkLacquer);
  base.position.y = 1.1;
  g.add(base);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.1, 4), MAT.roofTile);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.2 + 0.55;
  g.add(roof);

  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), MAT.paperLantern);
  lantern.position.set(0, 1.6, 1.5);
  g.add(lantern);

  return _withShadows(g);
}

/** A multi-tiered pagoda-style temple — the dominant landmark structure. */
export function buildTemple(): THREE.Group {
  const g = new THREE.Group();

  const platform = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 9), MAT.lanternStone);
  platform.position.y = 0.3;
  g.add(platform);

  const tiers = 3;
  let y = 0.6;
  for (let i = 0; i < tiers; i++) {
    const w = 8 - i * 1.8;
    const bodyH = 2.2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, w * 0.9), MAT.darkLacquer);
    body.position.y = y + bodyH / 2;
    g.add(body);
    y += bodyH;

    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, 1.3, 4), MAT.roofTile);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = y + 0.65;
    g.add(roof);
    y += 1.3;
  }

  // Entrance gate pillars.
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.2, 8), MAT.templeRed);
    pillar.position.set(side * 3.2, 1.9, 4.2);
    g.add(pillar);
  }

  return _withShadows(g);
}

/** A classic red torii gate. */
export function buildToriiGate(): THREE.Group {
  const g = new THREE.Group();
  const height = 5;

  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, height, 8), MAT.templeRed);
    pillar.position.set(side * 2.4, height / 2, 0);
    g.add(pillar);
  }

  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 0.5), MAT.templeRed);
  topBeam.position.y = height + 0.2;
  g.add(topBeam);
  const topCap = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.3, 0.7), MAT.darkLacquer);
  topCap.position.y = height + 0.5;
  g.add(topCap);

  const underBeam = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.3, 0.35), MAT.templeRed);
  underBeam.position.y = height - 0.7;
  g.add(underBeam);

  return _withShadows(g);
}

/** A stone garden lantern (tōrō) with a warm glowing top. */
export function buildStoneLantern(): THREE.Group {
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 6), MAT.lanternStone);
  base.position.y = 0.2;
  g.add(base);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1, 6), MAT.lanternStone);
  post.position.y = 0.9;
  g.add(post);

  const box = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 6), MAT.lanternStone);
  box.position.y = 1.7;
  g.add(box);

  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 6), MAT.paperLantern);
  glow.position.y = 1.7;
  g.add(glow);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.5, 6), MAT.lanternStone);
  cap.position.y = 2.2;
  g.add(cap);

  return _withShadows(g);
}

/** A tall bamboo cluster — thin segmented stalks. */
export function buildBambooCluster(stalkCount = 5): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < stalkCount; i++) {
    const h = 7 + (i % 3) * 1.5;
    const r = 0.5 + ((i * 29) % 10) / 10;
    const a = (i / stalkCount) * Math.PI * 2;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, h, 6), MAT.bamboo);
    stalk.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    g.add(stalk);
  }
  return _withShadows(g);
}

/** A cherry blossom tree — pink blossom clusters instead of pine foliage. */
export function buildCherryBlossomTree(heightScale = 1): THREE.Group {
  const g = new THREE.Group();
  const trunkH = 2.2 * heightScale;

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, trunkH, 6), MAT.blossomTrunk);
  trunk.position.y = trunkH / 2;
  g.add(trunk);

  const clusterCount = 5;
  for (let i = 0; i < clusterCount; i++) {
    const a = (i / clusterCount) * Math.PI * 2;
    const r = 0.9 * heightScale;
    const blossom = new THREE.Mesh(new THREE.SphereGeometry(1.1 * heightScale, 8, 6), MAT.blossomPink);
    blossom.position.set(Math.cos(a) * r, trunkH + 0.6 * heightScale, Math.sin(a) * r);
    g.add(blossom);
  }
  const top = new THREE.Mesh(new THREE.SphereGeometry(1.2 * heightScale, 8, 6), MAT.blossomPink);
  top.position.y = trunkH + 1.3 * heightScale;
  g.add(top);

  return _withShadows(g);
}

/** A koi pond — still water with a soft greenish tint. */
export function buildKoiPond(radius = 5): THREE.Group {
  const g = new THREE.Group();
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, 0.3, 16), MAT.pondWater);
  pond.position.y = 0.05;
  g.add(pond);
  return _withShadows(g);
}

// ── Swiss Alps props ─────────────────────────────────────────────────────────

/** A traditional Swiss chalet — wide overhanging roof, wooden balcony, flower boxes. */
export function buildChalet(): THREE.Group {
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.4, 4), MAT.chaletWood);
  base.position.y = 1.2;
  g.add(base);

  const upper = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.4, 4), MAT.chaletTrim);
  upper.position.y = 2.4 + 0.7;
  g.add(upper);

  // Wide overhanging roof — signature chalet silhouette.
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 1.6, 4), MAT.churchRoof);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 3.8 + 0.8;
  g.add(roof);

  // Balcony with railing, running the front width.
  const balcony = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.1, 0.8), MAT.chaletTrim);
  balcony.position.set(0, 2.5, 2.3);
  g.add(balcony);
  for (let i = -2; i <= 2; i++) {
    const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), MAT.chaletTrim);
    baluster.position.set(i * 0.8, 2.85, 2.65);
    g.add(baluster);
  }

  // Flower boxes under the balcony, alternating red/pink.
  for (let i = -1; i <= 1; i += 2) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.4), MAT.chaletTrim);
    box.position.set(i * 1.1, 2.1, 2.1);
    g.add(box);
    for (let f = 0; f < 3; f++) {
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), f % 2 === 0 ? MAT.flowerRed : MAT.flowerPink);
      flower.position.set(i * 1.1 - 0.5 + f * 0.5, 2.28, 2.15);
      g.add(flower);
    }
  }

  return _withShadows(g);
}

/** A small alpine village church with a tall spire tower. */
export function buildChurch(): THREE.Group {
  const g = new THREE.Group();

  const nave = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 7), MAT.churchStone);
  nave.position.set(0, 2, -1);
  g.add(nave);
  const naveRoof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.6, 4), MAT.churchRoof);
  naveRoof.rotation.y = Math.PI / 4;
  naveRoof.position.set(0, 4.8, -1);
  g.add(naveRoof);

  const towerH = 9;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, towerH, 2.4), MAT.churchStone);
  tower.position.set(0, towerH / 2, 2.8);
  g.add(tower);

  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.9, 3, 4), MAT.churchRoof);
  spire.rotation.y = Math.PI / 4;
  spire.position.set(0, towerH + 1.5, 2.8);
  g.add(spire);

  return _withShadows(g);
}

/** A cable-car support pylon with a gondola box hanging mid-span. */
export function buildCableCarPylon(heightM = 12): THREE.Group {
  const g = new THREE.Group();

  const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, heightM, 8), MAT.cableMetal);
  pylon.position.y = heightM / 2;
  g.add(pylon);

  const crossArm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 0.2), MAT.cableMetal);
  crossArm.position.y = heightM - 0.5;
  g.add(crossArm);

  const gondola = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.4), MAT.gondolaRed);
  gondola.position.set(1.6, heightM - 2.2, 0);
  g.add(gondola);

  return _withShadows(g);
}

/** A small alpine railway station platform with a shelter roof. */
export function buildRailwayStation(): THREE.Group {
  const g = new THREE.Group();

  const platform = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 3), MAT.lanternStone);
  platform.position.y = 0.2;
  g.add(platform);

  const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6);
  for (const x of [-3, 3]) {
    const post = new THREE.Mesh(postGeo, MAT.chaletTrim);
    post.position.set(x, 1.6, -1.2);
    g.add(post);
  }

  const shelter = new THREE.Mesh(new THREE.BoxGeometry(7, 0.2, 2.6), MAT.churchRoof);
  shelter.position.set(0, 2.9, -1.2);
  g.add(shelter);

  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.06), MAT.chaletTrim);
  sign.position.set(0, 2.2, 0.8);
  g.add(sign);

  return _withShadows(g);
}

/** A turquoise alpine lake surface. */
export function buildAlpineLake(radius = 8): THREE.Group {
  const g = new THREE.Group();
  const lake = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.92, 0.3, 18), MAT.turquoiseLake);
  lake.position.y = 0.05;
  g.add(lake);
  return _withShadows(g);
}

/** A wooden trail signboard post — wayfinding landmark. */
export function buildTrailSign(): THREE.Group {
  const g = new THREE.Group();

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2, 6), MAT.chaletTrim);
  post.position.y = 1;
  g.add(post);

  for (let i = 0; i < 2; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.06), MAT.chaletWood);
    plank.position.set(0.3, 1.5 - i * 0.35, 0);
    plank.rotation.y = i === 0 ? 0.2 : -0.3;
    g.add(plank);
  }

  return _withShadows(g);
}

/** A rustic stone-arch bridge, distinct from the wooden plank bridge. */
export function buildStoneBridge(length = 7): THREE.Group {
  const g = new THREE.Group();

  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, length), MAT.lanternStone);
  deck.position.y = 0.15;
  g.add(deck);

  const archGeo = new THREE.TorusGeometry(1.6, 0.35, 8, 12, Math.PI);
  const arch = new THREE.Mesh(archGeo, MAT.lanternStone);
  arch.rotation.z = Math.PI;
  arch.rotation.y = Math.PI / 2;
  arch.position.y = 0;
  g.add(arch);

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, length), MAT.lanternStone);
    rail.position.set(side * 1.2, 0.6, 0);
    g.add(rail);
  }

  return _withShadows(g);
}

/** A small wildflower patch — scattered color across alpine meadows. */
export function buildWildflowerPatch(): THREE.Group {
  const g = new THREE.Group();
  const colors = [MAT.flowerRed, MAT.flowerPink];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + i * 0.6;
    const r = 0.3 + (i % 4) * 0.3;
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), colors[i % 2]);
    flower.position.set(Math.cos(a) * r, 0.15, Math.sin(a) * r);
    g.add(flower);
  }
  return _withShadows(g);
}
