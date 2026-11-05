import type { LocalWorldDefinition, PropPlacement } from './LocalWorldDefinition';

/**
 * Hand-authored Rajasthan world — "The Lost Kingdom".
 *
 * Four connected zones on a rolling dune terrain:
 *   A. Golden Dunes   — open desert, scattered rocks, buried ruins (Lost Relic)
 *   B. Ancient Fort    — walled sandstone fortress with towers + gate
 *   C. Desert Village  — spawn area: havelis, well, market stalls
 *   D. Forgotten Oasis — secluded pool, palms, a second ruin site, treasure
 */

const desertVillage: PropPlacement[] = [
  { id: 'well-1',    kind: 'well',         x: 0,   z: 0 },
  { id: 'haveli-1',  kind: 'haveli',       x: -14, z: 6,  rotationY: 0.4 },
  { id: 'haveli-2',  kind: 'haveli',       x: 14,  z: 9,  rotationY: -0.3 },
  { id: 'haveli-3',  kind: 'haveli',       x: -9,  z: -16, rotationY: 1.2 },
  { id: 'haveli-4',  kind: 'haveli',       x: 11,  z: -13, rotationY: -1.0 },
  { id: 'stall-1',   kind: 'market-stall', x: 6,   z: -3, rotationY: 0.2 },
  { id: 'stall-2',   kind: 'market-stall', x: -6,  z: 3,  rotationY: -0.6 },
];

const ancientFort: PropPlacement[] = [
  { id: 'fort-gate-1',  kind: 'fort-gate',  x: 75, z: 58, rotationY: -0.6, label: 'Fort Gateway' },
  { id: 'fort-wall-1',  kind: 'fort-wall',  x: 95, z: 68, rotationY: -0.6 + Math.PI / 2 },
  { id: 'fort-wall-2',  kind: 'fort-wall',  x: 110, z: 50, rotationY: -0.6 },
  { id: 'fort-wall-3',  kind: 'fort-wall',  x: 95, z: 32, rotationY: -0.6 + Math.PI / 2 },
  { id: 'fort-tower-1', kind: 'fort-tower', x: 80, z: 75, label: 'North Tower' },
  { id: 'fort-tower-2', kind: 'fort-tower', x: 118, z: 58, label: 'East Tower' },
  { id: 'fort-tower-3', kind: 'fort-tower', x: 110, z: 25, label: 'South Tower' },
  { id: 'fort-tower-4', kind: 'fort-tower', x: 72, z: 30, label: 'West Tower' },
  { id: 'fort-viewpoint', kind: 'viewpoint', x: 95, z: 52, label: 'Fortress Rooftop' },
];

function _dunesRocks(): PropPlacement[] {
  const rocks: PropPlacement[] = [];
  const clusters = [
    { cx: -70, cz: -40, count: 10, radius: 28 },
    { cx: -40, cz: 60, count: 8, radius: 22 },
    { cx: 40, cz: -70, count: 9, radius: 26 },
  ];
  let i = 0;
  for (const c of clusters) {
    for (let n = 0; n < c.count; n++) {
      const a = (n / c.count) * Math.PI * 2 + n * 0.41;
      const r = c.radius * (0.3 + 0.7 * ((n * 29 % 97) / 97));
      rocks.push({
        id: `rock-${i++}`, kind: 'desert-rock',
        x: c.cx + Math.cos(a) * r, z: c.cz + Math.sin(a) * r,
        rotationY: a,
      });
    }
  }
  return rocks;
}

const landmarks: PropPlacement[] = [
  { id: 'dunes-ruins', kind: 'ruins', x: -70, z: -90, rotationY: 0.5, label: 'Buried Ruins' },
  { id: 'dunes-viewpoint', kind: 'viewpoint', x: -60, z: 100, label: 'Desert Viewpoint' },
  { id: 'oasis-pool-1', kind: 'oasis-pool', x: -110, z: -70, label: 'Forgotten Oasis' },
  { id: 'oasis-ruins', kind: 'ruins', x: -118, z: -78, rotationY: 1.4, label: 'Abandoned Structure' },
];

function _oasisPalms(): PropPlacement[] {
  const palms: PropPlacement[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = 7 + (i % 3) * 1.5;
    palms.push({
      id: `palm-${i}`, kind: 'palm-tree',
      x: -110 + Math.cos(a) * r, z: -70 + Math.sin(a) * r,
      rotationY: a,
    });
  }
  return palms;
}

const collectibles: PropPlacement[] = [
  // Mission 01 — The Lost Relic: hidden near the dunes ruins.
  { id: 'relic-1', kind: 'vi3w-asset', assetId: 'ancient-artifact', x: -66, z: -94, label: 'The Lost Relic' },
  // Mission 04 — Forgotten Oasis: treasure near the abandoned structure.
  { id: 'chest-1', kind: 'vi3w-asset', assetId: 'treasure-chest', x: -116, z: -75, label: 'Treasure Chest' },
  { id: 'signboard-1', kind: 'vi3w-asset', assetId: 'signboard', x: 0, z: 14, label: 'Village Signboard' },
];

export const RAJASTHAN_WORLD: LocalWorldDefinition = {
  worldId: 'rajasthan',
  name: 'Rajasthan',
  terrain: {
    sizeM: 500,
    resolution: 112,
    maxHeightM: 42,
    valleyFlatness: 0, // unused for 'dunes'
    colorLow: 0xc9a059,   // sand in shadow
    colorHigh: 0xf0c878,  // sunlit dune crest
    seed: 5208,
    shape: 'dunes',
  },
  spawn: { x: 0, z: 14, facingRadians: Math.PI },

  // Main path: village → fort.
  pathPoints: [
    [0, 10], [18, 22], [40, 34], [60, 46], [75, 55], [85, 58],
  ],
  // Branch trails: village → dunes viewpoint, viewpoint-area → oasis, dunes → buried ruins.
  branchTrails: [
    [[0, 10], [-30, 24], [-55, 60], [-60, 100]],
    [[-55, 60], [-80, 20], [-100, -30], [-110, -65]],
    [[-80, 20], [-72, -40], [-68, -88]],
  ],

  props: [...desertVillage, ...ancientFort, ..._dunesRocks(), ...landmarks, ..._oasisPalms(), ...collectibles],

  // Dramatic desert sunset: deep orange key light, long shadows, cool fill.
  skyColor: 0xe07a4a,
  fogColor: 0xd98858,
  fogDensity: 0.0018,
  lighting: {
    sunColor: 0xff9d52,
    sunIntensity: 1.8,
    sunPosition: [-220, 28, -60],
    ambientColor: 0x6a5a7a,
    ambientIntensity: 0.32,
  },
};
