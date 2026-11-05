import type { LocalWorldDefinition, PropPlacement } from './LocalWorldDefinition';

/**
 * Hand-authored Kyoto world — "The Forgotten Traditions".
 *
 * Spawn on a village street, temple visible to the south, bamboo forest to
 * the west, cherry blossom gardens to the east — four connected zones:
 *   A. Old Streets           — machiya houses, tea houses (spawn)
 *   B. Temple District        — pagoda temple, torii gate, stone lanterns
 *   C. Bamboo Forest           — dense bamboo, a bridge, hidden shrine
 *   D. Cherry Blossom Gardens  — blossom trees, koi pond, lanterns
 */

const oldStreets: PropPlacement[] = [
  { id: 'machiya-1', kind: 'machiya', x: -16, z: 14, rotationY: 0.3 },
  { id: 'machiya-2', kind: 'machiya', x: -8, z: 26, rotationY: -0.2 },
  { id: 'machiya-3', kind: 'machiya', x: 14, z: 16, rotationY: 1.0 },
  { id: 'teahouse-1', kind: 'tea-house', x: 6, z: 28, rotationY: -0.6 },
];

const templeDistrict: PropPlacement[] = [
  { id: 'temple-1', kind: 'temple', x: 0, z: -80, label: 'The Ancient Temple' },
  { id: 'torii-1', kind: 'torii-gate', x: 0, z: -40, label: 'Temple Gate' },
  { id: 'lantern-t1', kind: 'stone-lantern', x: -5, z: -55 },
  { id: 'lantern-t2', kind: 'stone-lantern', x: 5, z: -55 },
  { id: 'lantern-t3', kind: 'stone-lantern', x: -5, z: -68 },
  { id: 'lantern-t4', kind: 'stone-lantern', x: 5, z: -68 },
  { id: 'temple-viewpoint', kind: 'viewpoint', x: 0, z: -95, label: 'Temple Overlook' },
];

function _bambooForest(): PropPlacement[] {
  const clusters: PropPlacement[] = [];
  let i = 0;
  const centers = [{ cx: -65, cz: 5, r: 24 }, { cx: -85, cz: -20, r: 20 }, { cx: -55, cz: -35, r: 18 }];
  for (const c of centers) {
    const count = 10;
    for (let n = 0; n < count; n++) {
      const a = (n / count) * Math.PI * 2 + n * 0.5;
      const r = c.r * (0.3 + 0.7 * ((n * 31 % 97) / 97));
      clusters.push({ id: `bamboo-${i++}`, kind: 'bamboo-cluster', x: c.cx + Math.cos(a) * r, z: c.cz + Math.sin(a) * r });
    }
  }
  return clusters;
}

const bambooForest: PropPlacement[] = [
  { id: 'bamboo-bridge', kind: 'bridge', x: -45, z: -10, rotationY: 0.9, label: 'Forest Bridge' },
  ..._bambooForest(),
];

function _blossomTrees(): PropPlacement[] {
  const trees: PropPlacement[] = [];
  const positions: Array<[number, number]> = [
    [55, 10], [68, 18], [62, 32], [78, 40], [50, 45], [72, -5], [85, 15], [60, 60],
  ];
  return positions.map(([x, z], i) => ({
    id: `blossom-${i}`, kind: 'cherry-blossom', x, z, rotationY: (i * 0.7) % (Math.PI * 2),
  }));
}

const cherryGardens: PropPlacement[] = [
  { id: 'koi-pond-1', kind: 'koi-pond', x: 65, z: 25, label: 'Koi Pond' },
  { id: 'garden-bridge', kind: 'bridge', x: 65, z: 10, rotationY: Math.PI / 2, label: 'Garden Bridge' },
  { id: 'lantern-g1', kind: 'stone-lantern', x: 55, z: 30 },
  { id: 'lantern-g2', kind: 'stone-lantern', x: 75, z: 20 },
  ..._blossomTrees(),
];

const collectibles: PropPlacement[] = [
  // Hidden shrine, deep in the bamboo forest.
  { id: 'relic-1', kind: 'vi3w-asset', assetId: 'ancient-artifact', x: -82, z: -24, label: 'Hidden Shrine Relic' },
  { id: 'chest-1', kind: 'vi3w-asset', assetId: 'treasure-chest', x: 70, z: 38, label: "Garden Keeper's Chest" },
  { id: 'signboard-1', kind: 'vi3w-asset', assetId: 'signboard', x: 2, z: 10, label: 'Street Signboard' },
];

export const KYOTO_WORLD: LocalWorldDefinition = {
  worldId: 'kyoto',
  name: 'Kyoto',
  terrain: {
    sizeM: 500,
    resolution: 112,
    maxHeightM: 75,
    valleyFlatness: 0.46,
    colorLow: 0x3f5a38,   // forested hillside green
    colorHigh: 0xcdd0bc,  // pale upper hills
    seed: 7122,
    shape: 'valley',
  },
  spawn: { x: 0, z: 20, facingRadians: Math.PI },

  // Main path: village street → temple district (south).
  pathPoints: [
    [0, 18], [0, 0], [0, -20], [0, -40], [0, -65], [0, -80],
  ],
  branchTrails: [
    // Village → bamboo forest (west).
    [[-10, 15], [-30, 8], [-45, -2], [-60, -10]],
    // Village → cherry blossom gardens (east).
    [[12, 18], [32, 15], [48, 15], [62, 18]],
  ],

  props: [...oldStreets, ...templeDistrict, ...bambooForest, ...cherryGardens, ...collectibles],

  // Soft spring morning: warm gentle sunlight, pale pink-tinted haze.
  skyColor: 0xd8e0e8,
  fogColor: 0xe8dce0,
  fogDensity: 0.0024,
  lighting: {
    sunColor: 0xfff0d8,
    sunIntensity: 1.4,
    sunPosition: [60, 90, 40],
    ambientColor: 0xd8b8c0,
    ambientIntensity: 0.42,
  },
};
