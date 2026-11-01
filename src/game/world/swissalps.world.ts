import type { LocalWorldDefinition, PropPlacement } from './LocalWorldDefinition';

/**
 * Hand-authored Swiss Alps world — "Beyond the Summit".
 *
 * Spawn in the central alpine village, overlooking meadows and a turquoise
 * lake, with a waterfall and snow-capped peaks dominating the skyline.
 *   A. Alpine Village        — chalets, church, railway station (spawn)
 *   B. Green Valley           — meadows, wildflowers, waterfall, bridges
 *   C. Mountain Lake           — turquoise lake, pine shoreline, dock
 *   D. High Mountain Trails     — cable car, alpine cabin, summit viewpoint
 */

const alpineVillage: PropPlacement[] = [
  { id: 'chalet-1', kind: 'chalet', x: -16, z: 10, rotationY: 0.3 },
  { id: 'chalet-2', kind: 'chalet', x: 16, z: 14, rotationY: -0.4 },
  { id: 'chalet-3', kind: 'chalet', x: -20, z: 28, rotationY: 1.0 },
  { id: 'chalet-4', kind: 'chalet', x: 20, z: 30, rotationY: -1.1 },
  { id: 'church-1', kind: 'church', x: 0, z: 36, label: 'Village Church' },
  { id: 'station-1', kind: 'railway-station', x: 30, z: 4, rotationY: -0.3, label: 'Mountain Railway Station' },
  { id: 'cablecar-1', kind: 'cable-car-pylon', x: -8, z: -8 },
];

const greenValley: PropPlacement[] = [
  { id: 'waterfall-1', kind: 'waterfall', x: 45, z: -55, rotationY: 0.6, label: 'Alpine Waterfall' },
  { id: 'stonebridge-1', kind: 'stone-bridge', x: 32, z: -42, rotationY: Math.PI / 2 },
  { id: 'bridge-1', kind: 'bridge', x: -28, z: -40, rotationY: 0.2 },
  { id: 'wild-1', kind: 'wildflower-patch', x: 5, z: -18 },
  { id: 'wild-2', kind: 'wildflower-patch', x: -12, z: -24 },
  { id: 'wild-3', kind: 'wildflower-patch', x: 18, z: -32 },
  { id: 'wild-4', kind: 'wildflower-patch', x: -5, z: -35 },
];

function _lakePines(): PropPlacement[] {
  const trees: PropPlacement[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + i * 0.4;
    const r = 18 + ((i * 23) % 10);
    trees.push({ id: `pine-${i}`, kind: 'pine-tree', x: -60 + Math.cos(a) * r, z: -60 + Math.sin(a) * r, rotationY: a });
  }
  return trees;
}

const mountainLake: PropPlacement[] = [
  { id: 'lake-1', kind: 'alpine-lake', x: -60, z: -60, label: 'Turquoise Lake' },
  { id: 'dock-1', kind: 'dock', x: -48, z: -50, rotationY: 0.5 },
  { id: 'trailsign-1', kind: 'trail-sign', x: -38, z: -46 },
  ..._lakePines(),
];

const highMountainTrails: PropPlacement[] = [
  { id: 'cabin-1', kind: 'cabin', x: 60, z: -75, rotationY: 0.9, label: 'Mountain Shelter' },
  { id: 'summit-viewpoint', kind: 'viewpoint', x: 78, z: -90, label: 'Summit Viewpoint' },
  { id: 'trailsign-2', kind: 'trail-sign', x: 40, z: -60 },
  { id: 'trailsign-3', kind: 'trail-sign', x: 65, z: -82 },
];

const collectibles: PropPlacement[] = [
  // Hidden near the mountain shelter, high above the valley.
  { id: 'relic-1', kind: 'vi3w-asset', assetId: 'ancient-artifact', x: 68, z: -85, label: "Climber's Relic" },
  { id: 'chest-1', kind: 'vi3w-asset', assetId: 'treasure-chest', x: -52, z: -55, label: "Lake Keeper's Chest" },
  { id: 'signboard-1', kind: 'vi3w-asset', assetId: 'signboard', x: 0, z: 18, label: 'Village Square Signboard' },
];

export const SWISS_ALPS_WORLD: LocalWorldDefinition = {
  worldId: 'swiss-alps',
  name: 'Swiss Alps',
  terrain: {
    sizeM: 500,
    resolution: 112,
    maxHeightM: 125,
    valleyFlatness: 0.4,
    colorLow: 0x5c8a3a,   // lush alpine meadow
    colorHigh: 0xfafcff,  // bright snow-capped peaks
    seed: 8311,
    shape: 'valley',
  },
  spawn: { x: 0, z: 20, facingRadians: Math.PI },

  // Main path: village → valley/waterfall → lake.
  pathPoints: [
    [0, 15], [5, -5], [8, -20], [0, -35], [-20, -48], [-45, -55],
  ],
  branchTrails: [
    // Valley → high mountain trails (cable car, cabin, summit).
    [[8, -20], [30, -35], [45, -55], [60, -72], [78, -88]],
  ],

  props: [...alpineVillage, ...greenValley, ...mountainLake, ...highMountainTrails, ...collectibles],

  // Bright, clear alpine summer daylight.
  skyColor: 0xb8d4e8,
  fogColor: 0xd0e4ec,
  fogDensity: 0.0018,
  lighting: {
    sunColor: 0xfff4dc,
    sunIntensity: 1.7,
    sunPosition: [100, 110, 60],
    ambientColor: 0x8aa8c8,
    ambientIntensity: 0.45,
  },
};
