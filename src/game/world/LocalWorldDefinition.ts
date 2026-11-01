/**
 * Data model for a hand-authored, code-defined local world.
 *
 * No backend round-trip: terrain is generated procedurally from
 * `TerrainConfig`, and every building/tree/landmark is a fixed entry in
 * `props`. The whole thing loads synchronously from this one object.
 */

export interface TerrainConfig {
  /** Full extent of the playable square, in metres (e.g. 500 = 500m x 500m). */
  sizeM: number;
  /** Heightfield resolution per axis (higher = smoother, more triangles). */
  resolution: number;
  /** Peak elevation above the valley floor, in metres. */
  maxHeightM: number;
  /** 0-1: how much of the terrain is carved into a flat valley floor (0 = all peaks, 1 = all flat). Ignored for 'dunes'. */
  valleyFlatness: number;
  /** Base color of the terrain material (hex). */
  colorLow: number;
  /** Color blended in at higher elevations (e.g. snow/rock, or sunlit dune crests). */
  colorHigh: number;
  /** Random seed so the generated terrain is deterministic across reloads. */
  seed: number;
  /** 'valley' (default) = ringed peaks around a flat centre. 'dunes' = rolling desert ridges, no radial shaping. */
  shape?: 'valley' | 'dunes';
}

export type PropKind =
  | 'cottage'
  | 'cabin'
  | 'pine-tree'
  | 'bridge'
  | 'viewpoint'
  | 'waterfall'
  | 'shop'
  | 'fort-wall'
  | 'fort-tower'
  | 'fort-gate'
  | 'haveli'
  | 'well'
  | 'market-stall'
  | 'palm-tree'
  | 'ruins'
  | 'desert-rock'
  | 'oasis-pool'
  | 'turf-house'
  | 'lighthouse'
  | 'dock'
  | 'iceberg'
  | 'basalt-columns'
  | 'frozen-lake'
  | 'village-shop'
  | 'machiya'
  | 'tea-house'
  | 'temple'
  | 'torii-gate'
  | 'stone-lantern'
  | 'bamboo-cluster'
  | 'cherry-blossom'
  | 'koi-pond'
  | 'chalet'
  | 'church'
  | 'cable-car-pylon'
  | 'railway-station'
  | 'alpine-lake'
  | 'trail-sign'
  | 'stone-bridge'
  | 'wildflower-patch'
  | 'vi3w-asset'; // resolved through AssetRegistry (treasure-chest, ancient-artifact, signboard)

export interface PropPlacement {
  id: string;
  kind: PropKind;
  /** World-space position: x = east, z = south (negative = north), y auto-snapped to terrain unless given. */
  x: number;
  z: number;
  /** Y-axis rotation in radians. */
  rotationY?: number;
  /** Uniform scale multiplier. */
  scale?: number;
  /** Only used when kind === 'vi3w-asset' — id from AssetRegistry. */
  assetId?: string;
  /** Human-readable label shown on discovery (landmarks, viewpoints). */
  label?: string;
}

export interface LocalWorldDefinition {
  worldId: string;
  name: string;
  terrain: TerrainConfig;
  /** Player spawn, in the same x/z space as props. */
  spawn: { x: number; z: number; facingRadians: number };
  props: PropPlacement[];
  /** Hand-authored main path as a polyline of [x, z] points. */
  pathPoints: Array<[number, number]>;
  /** Optional branching side trails, same format as pathPoints. */
  branchTrails?: Array<Array<[number, number]>>;
  /** Optional river centerline — rendered as a flowing ribbon of `riverWidthM`. */
  riverPoints?: Array<[number, number]>;
  riverWidthM?: number;
  /** Ambient lighting tint for this world's time-of-day mood. */
  skyColor: number;
  fogColor: number;
  fogDensity: number;
  /** Optional golden-hour / mood lighting override (passed to SceneManager.setLighting). */
  lighting?: {
    sunColor?: number; sunIntensity?: number; sunPosition?: [number, number, number];
    ambientColor?: number; ambientIntensity?: number;
  };
}
