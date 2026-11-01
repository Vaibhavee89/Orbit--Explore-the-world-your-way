import type { LocalWorldDefinition, PropPlacement } from './LocalWorldDefinition';

/**
 * Hand-authored Iceland world — "The Frozen Frontier".
 *
 * Spawn on a rise above a Nordic coastal village. Four connected zones:
 *   D. Northern Village — turf houses, shop, spawn point
 *   B. Black Coast       — lighthouse, dock, basalt columns
 *   C. Waterfall Trail    — the big landmark waterfall + river
 *   A. Glacier Valley      — icebergs, frozen lake, hidden artifact
 */

const northernVillage: PropPlacement[] = [
  { id: 'turf-1', kind: 'turf-house', x: 22, z: 38, rotationY: 0.3 },
  { id: 'turf-2', kind: 'turf-house', x: 12, z: 44, rotationY: -0.4 },
  { id: 'turf-3', kind: 'turf-house', x: 30, z: 48, rotationY: 1.0 },
  { id: 'shop-1', kind: 'village-shop', x: 18, z: 30, rotationY: -0.2 },
];

const blackCoast: PropPlacement[] = [
  { id: 'dock-1', kind: 'dock', x: 45, z: 8, rotationY: 0.2, label: 'Fishing Dock' },
  { id: 'lighthouse-1', kind: 'lighthouse', x: 62, z: -20, label: 'Coastal Lighthouse' },
  { id: 'basalt-1', kind: 'basalt-columns', x: 72, z: -42 },
  { id: 'basalt-2', kind: 'basalt-columns', x: 48, z: -55 },
  { id: 'basalt-3', kind: 'basalt-columns', x: 85, z: -10 },
];

const waterfallTrail: PropPlacement[] = [
  { id: 'waterfall-1', kind: 'waterfall', x: -42, z: 10, rotationY: 0.4, label: 'The Frozen Waterfall' },
  { id: 'wf-viewpoint', kind: 'viewpoint', x: -28, z: 22, label: 'Waterfall Overlook' },
];

function _glacierIcebergs(): PropPlacement[] {
  const bergs: PropPlacement[] = [];
  const clusters = [
    { cx: -95, cz: 65, count: 10, radius: 26 },
    { cx: -70, cz: 90, count: 7, radius: 20 },
  ];
  let i = 0;
  for (const c of clusters) {
    for (let n = 0; n < c.count; n++) {
      const a = (n / c.count) * Math.PI * 2 + n * 0.44;
      const r = c.radius * (0.3 + 0.7 * ((n * 31 % 97) / 97));
      bergs.push({
        id: `iceberg-${i++}`, kind: 'iceberg',
        x: c.cx + Math.cos(a) * r, z: c.cz + Math.sin(a) * r,
        rotationY: a,
      });
    }
  }
  return bergs;
}

const glacierValley: PropPlacement[] = [
  { id: 'frozen-lake-1', kind: 'frozen-lake', x: -75, z: 55, label: 'Frozen Lake' },
  ..._glacierIcebergs(),
];

const collectibles: PropPlacement[] = [
  // Mission: hidden among the glacier's ice, past the frozen lake.
  { id: 'relic-1', kind: 'vi3w-asset', assetId: 'ancient-artifact', x: -92, z: 72, label: 'Frozen Relic' },
  { id: 'chest-1', kind: 'vi3w-asset', assetId: 'treasure-chest', x: -38, z: 4, label: "Fisherman's Chest" },
  { id: 'signboard-1', kind: 'vi3w-asset', assetId: 'signboard', x: 20, z: 26, label: 'Village Signboard' },
];

export const ICELAND_WORLD: LocalWorldDefinition = {
  worldId: 'iceland',
  name: 'Iceland',
  terrain: {
    sizeM: 500,
    resolution: 112,
    maxHeightM: 110,
    valleyFlatness: 0.38,
    colorLow: 0x394038,   // dark mossy volcanic rock
    colorHigh: 0xf5f8fa,  // glacier snow/ice
    seed: 6410,
    shape: 'valley',
  },
  spawn: { x: 22, z: 42, facingRadians: Math.PI * 0.75 },

  // Main path: village → waterfall → glacier valley.
  pathPoints: [
    [20, 32], [0, 26], [-20, 20], [-30, 16], [-42, 12],
  ],
  branchTrails: [
    // Waterfall → deeper into the glacier valley.
    [[-30, 16], [-55, 35], [-75, 50], [-90, 68]],
    // Village → coast (dock + lighthouse).
    [[22, 34], [35, 22], [45, 10], [58, -12]],
  ],

  props: [...northernVillage, ...blackCoast, ...waterfallTrail, ...glacierValley, ...collectibles],

  // Cold blue daylight, soft overcast sun, strong atmospheric mist/fog.
  skyColor: 0xaebfd0,
  fogColor: 0xc8d6e0,
  fogDensity: 0.0032,
  lighting: {
    sunColor: 0xd8e6f0,
    sunIntensity: 1.3,
    sunPosition: [80, 70, -60],
    ambientColor: 0x6a85a0,
    ambientIntensity: 0.48,
  },
};
