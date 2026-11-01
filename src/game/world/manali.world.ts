import type { LocalWorldDefinition, PropPlacement } from './LocalWorldDefinition';

/**
 * Hand-authored Manali world — Old Manali composition:
 * village square → river crossing (wooden bridge) → viewpoint, with branch
 * trails to a waterfall and a quest cabin, plus a hidden forest clearing
 * holding the collectible artifact.
 */

const villageSquare: PropPlacement[] = [
  { id: 'cottage-1', kind: 'cottage', x: -24, z: 14, rotationY: 0.4 },
  { id: 'cottage-2', kind: 'cottage', x: -16, z: 24, rotationY: -0.2 },
  { id: 'cottage-3', kind: 'cottage', x: -32, z: 28, rotationY: 1.1 },
  { id: 'shop-1',    kind: 'shop',    x: -6,  z: 16, rotationY: -0.5 },
];

function _pineForest(): PropPlacement[] {
  const trees: PropPlacement[] = [];
  const clusters = [
    { cx: 60, cz: -60, count: 24, radius: 34 },   // across the river, flanking the viewpoint trail
    { cx: -65, cz: -50, count: 22, radius: 28 },  // deep forest, around the hidden clearing
    { cx: -55, cz: 40, count: 14, radius: 20 },   // near the waterfall trail
    { cx: 20, cz: 90, count: 16, radius: 24 },    // north slope
  ];
  let i = 0;
  for (const c of clusters) {
    for (let n = 0; n < c.count; n++) {
      const a = (n / c.count) * Math.PI * 2 + n * 0.37;
      const r = c.radius * (0.3 + 0.7 * ((n * 53 % 97) / 97));
      trees.push({
        id: `pine-${i++}`,
        kind: 'pine-tree',
        x: c.cx + Math.cos(a) * r,
        z: c.cz + Math.sin(a) * r,
        rotationY: a,
      });
    }
  }
  return trees;
}

const landmarks: PropPlacement[] = [
  { id: 'bridge-1', kind: 'bridge', x: 12, z: 2, rotationY: Math.PI / 2, label: 'Old Wooden Bridge' },
  { id: 'viewpoint-1', kind: 'viewpoint', x: 70, z: -10, label: 'Solang Viewpoint' },
  { id: 'waterfall-1', kind: 'waterfall', x: -58, z: 44, rotationY: 0.3, label: 'Jogini Falls' },
  { id: 'cabin-1', kind: 'cabin', x: -4, z: -58, rotationY: 0.8, label: "Ranger's Cabin" },
];

const collectibles: PropPlacement[] = [
  // Hidden forest clearing — not on any marked path, tucked deep in the trees.
  { id: 'artifact-1', kind: 'vi3w-asset', assetId: 'ancient-artifact', x: -68, z: -48, label: 'Ancient Artifact' },
  { id: 'chest-1', kind: 'vi3w-asset', assetId: 'treasure-chest', x: -56, z: 40, label: 'Treasure Chest' },
  { id: 'signboard-1', kind: 'vi3w-asset', assetId: 'signboard', x: -14, z: 8, label: 'Village Signboard' },
];

export const MANALI_WORLD: LocalWorldDefinition = {
  worldId: 'manali',
  name: 'Manali',
  terrain: {
    sizeM: 500,
    resolution: 112,
    maxHeightM: 90,
    valleyFlatness: 0.4,
    colorLow: 0x3a4a2e,   // deep pine-forest green
    colorHigh: 0xf2ede2,  // warm snow-capped peaks (golden-hour tint)
    seed: 1892,
  },
  spawn: { x: -20, z: 20, facingRadians: 0 },

  // Main path: village square → river crossing → viewpoint.
  pathPoints: [
    [-32, 28], [-24, 14], [-6, 16], [4, 6], [12, 2], [22, -2], [45, -8], [70, -10],
  ],
  // Side trails: village → waterfall, and river crossing → cabin.
  branchTrails: [
    [[-24, 14], [-38, 24], [-48, 34], [-58, 44]],
    [[8, 4], [0, -20], [-4, -40], [-4, -58]],
  ],

  // River flows roughly north-south, crossed by the bridge at (12, 2).
  riverPoints: [
    [16, -120], [14, -60], [13, -10], [12, 2], [11, 20], [14, 70], [18, 120],
  ],
  riverWidthM: 7,

  props: [...villageSquare, ..._pineForest(), ...landmarks, ...collectibles],

  // Golden-hour mood: warm low-angle key light, cool ambient fill, warm haze.
  skyColor: 0xf0cfa0,
  fogColor: 0xe8c9a0,
  fogDensity: 0.0026,
  lighting: {
    sunColor: 0xffcf8a,
    sunIntensity: 1.6,
    sunPosition: [-140, 55, 90],
    ambientColor: 0x8fa0b8,
    ambientIntensity: 0.38,
  },
};
