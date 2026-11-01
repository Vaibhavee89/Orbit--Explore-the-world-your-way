import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import type { LocalWorldDefinition, PropPlacement } from './LocalWorldDefinition';
import { generateProceduralTerrain } from './ProceduralTerrain';
import {
  buildCottage, buildPineTree, buildBridge, buildViewpoint, buildWaterfall, buildShop, buildCabin,
  buildFortWall, buildFortTower, buildFortGate, buildHaveli, buildWell, buildMarketStall,
  buildPalmTree, buildRuins, buildDesertRock, buildOasisPool,
  buildTurfHouse, buildLighthouse, buildDock, buildIceberg, buildBasaltColumns,
  buildFrozenLake, buildVillageShop,
  buildMachiya, buildTeaHouse, buildTemple, buildToriiGate, buildStoneLantern,
  buildBambooCluster, buildCherryBlossomTree, buildKoiPond,
  buildChalet, buildChurch, buildCableCarPylon, buildRailwayStation, buildAlpineLake,
  buildTrailSign, buildStoneBridge, buildWildflowerPatch,
} from './PropBuilder';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { SceneManager } from '../rendering/SceneManager';
import { AssetPlacer } from '../assets/AssetPlacer';
import { AssetRegistry } from '../assets/AssetRegistry';

export interface DiscoverableZoneInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface LocalWorldLoadResult {
  spawnY: number;
  terrainSizeM: number;
  /** Labeled landmark props (bridges, viewpoints, temples, …) for DiscoveryManager — excludes vi3w collectibles. */
  discoverableZones: DiscoverableZoneInfo[];
}

/** Sample terrain height at (x, z) via bilinear interpolation of the heights grid. */
function _sampleHeight(
  heights: Float32Array, resolution: number, sizeM: number, x: number, z: number,
): number {
  const half = sizeM / 2;
  const fx = THREE.MathUtils.clamp((x + half) / sizeM, 0, 1) * (resolution - 1);
  const fz = THREE.MathUtils.clamp((z + half) / sizeM, 0, 1) * (resolution - 1);
  const c0 = Math.floor(fx), r0 = Math.floor(fz);
  const c1 = Math.min(c0 + 1, resolution - 1), r1 = Math.min(r0 + 1, resolution - 1);
  const sx = fx - c0, sz = fz - r0;
  const h00 = heights[r0 * resolution + c0];
  const h10 = heights[r0 * resolution + c1];
  const h01 = heights[r1 * resolution + c0];
  const h11 = heights[r1 * resolution + c1];
  const hx0 = h00 * (1 - sx) + h10 * sx;
  const hx1 = h01 * (1 - sx) + h11 * sx;
  return hx0 * (1 - sz) + hx1 * sz;
}

function _buildPropMesh(prop: PropPlacement): THREE.Group | null {
  switch (prop.kind) {
    case 'cottage':      return buildCottage();
    case 'cabin':         return buildCabin();
    case 'pine-tree':     return buildPineTree(0.8 + ((prop.x * 13 + prop.z * 7) % 10) / 10 * 0.6);
    case 'bridge':        return buildBridge(8);
    case 'viewpoint':     return buildViewpoint();
    case 'waterfall':     return buildWaterfall(7);
    case 'shop':          return buildShop();
    case 'fort-wall':     return buildFortWall(prop.scale ? 14 * prop.scale : 14);
    case 'fort-tower':    return buildFortTower();
    case 'fort-gate':     return buildFortGate();
    case 'haveli':        return buildHaveli();
    case 'well':          return buildWell();
    case 'market-stall':  return buildMarketStall();
    case 'palm-tree':     return buildPalmTree(0.8 + ((prop.x * 11 + prop.z * 5) % 10) / 10 * 0.5);
    case 'ruins':         return buildRuins();
    case 'desert-rock':   return buildDesertRock(0.7 + ((prop.x * 7 + prop.z * 3) % 10) / 10);
    case 'oasis-pool':    return buildOasisPool(prop.scale ? 5 * prop.scale : 5);
    case 'turf-house':    return buildTurfHouse();
    case 'lighthouse':    return buildLighthouse();
    case 'dock':          return buildDock(prop.scale ? 10 * prop.scale : 10);
    case 'iceberg':       return buildIceberg(0.8 + ((prop.x * 9 + prop.z * 4) % 10) / 10 * 0.8);
    case 'basalt-columns': return buildBasaltColumns();
    case 'frozen-lake':   return buildFrozenLake(prop.scale ? 6 * prop.scale : 6);
    case 'village-shop':  return buildVillageShop();
    case 'machiya':       return buildMachiya();
    case 'tea-house':     return buildTeaHouse();
    case 'temple':        return buildTemple();
    case 'torii-gate':    return buildToriiGate();
    case 'stone-lantern': return buildStoneLantern();
    case 'bamboo-cluster': return buildBambooCluster(4 + Math.round(((prop.x * 3 + prop.z * 7) % 10) / 3));
    case 'cherry-blossom': return buildCherryBlossomTree(0.8 + ((prop.x * 13 + prop.z * 7) % 10) / 10 * 0.5);
    case 'koi-pond':      return buildKoiPond(prop.scale ? 5 * prop.scale : 5);
    case 'chalet':         return buildChalet();
    case 'church':          return buildChurch();
    case 'cable-car-pylon': return buildCableCarPylon(prop.scale ? 12 * prop.scale : 12);
    case 'railway-station': return buildRailwayStation();
    case 'alpine-lake':     return buildAlpineLake(prop.scale ? 8 * prop.scale : 8);
    case 'trail-sign':      return buildTrailSign();
    case 'stone-bridge':    return buildStoneBridge(prop.scale ? 7 * prop.scale : 7);
    case 'wildflower-patch': return buildWildflowerPatch();
    default:              return null; // 'vi3w-asset' handled separately via AssetPlacer
  }
}

/** Solid prop kinds that should block the player (simple box colliders). */
const SOLID_KINDS = new Set([
  'cottage', 'cabin', 'shop', 'bridge', 'fort-wall', 'fort-tower', 'fort-gate', 'haveli', 'well',
  'turf-house', 'lighthouse', 'village-shop', 'machiya', 'tea-house', 'temple', 'torii-gate',
  'chalet', 'church', 'railway-station', 'stone-bridge', 'cable-car-pylon',
]);

/** Build a flowing river ribbon of `widthM` along a centerline polyline. */
function _buildRiver(
  points: Array<[number, number]>, widthM: number,
  heights: Float32Array, resolution: number, sizeM: number,
): THREE.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const next = points[Math.min(i + 1, points.length - 1)];
    const prev = points[Math.max(i - 1, 0)];
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    // Perpendicular to the direction of travel, scaled to half-width.
    const nx = (-dz / len) * (widthM / 2);
    const nz = (dx / len) * (widthM / 2);

    const y = _sampleHeight(heights, resolution, sizeM, x, z) + 0.15;
    positions.push(x + nx, y, z + nz, x - nx, y, z - nz);

    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x3f7a8c, transparent: true, opacity: 0.8, roughness: 0.15, metalness: 0.3,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

export class LocalWorldLoader {
  async load(
    def: LocalWorldDefinition,
    scene: SceneManager,
    physics: PhysicsWorld,
    placer: AssetPlacer,
  ): Promise<LocalWorldLoadResult> {
    // ── 1. Terrain ──────────────────────────────────────────────────────────
    const { mesh, heights, resolution, sizeM } = generateProceduralTerrain(def.terrain);
    scene.add(mesh);

    // Rapier heightfield: row-major → column-major transpose (same convention
    // as the backend HeightfieldLoader), centred at origin to match the mesh.
    const colMajor = new Float32Array(resolution * resolution);
    for (let r = 0; r < resolution; r++) {
      for (let c = 0; c < resolution; c++) {
        colMajor[r + c * resolution] = heights[r * resolution + c];
      }
    }
    const hfDesc = RAPIER.ColliderDesc.heightfield(
      resolution - 1, resolution - 1, colMajor, { x: sizeM, y: 1.0, z: sizeM },
    );
    physics.world.createCollider(hfDesc);

    // Scene fog/sky mood + optional golden-hour lighting override.
    scene.scene.background = new THREE.Color(def.skyColor);
    scene.scene.fog = new THREE.FogExp2(def.fogColor, def.fogDensity);
    if (def.lighting) scene.setLighting(def.lighting);

    // ── 2. Paths, trails & river ────────────────────────────────────────────
    const pathMat = new THREE.LineBasicMaterial({ color: 0xcbb994, linewidth: 2 });
    const _drawLine = (points: Array<[number, number]>) => {
      if (points.length < 2) return;
      const pts = points.map(([x, z]) => {
        const y = _sampleHeight(heights, resolution, sizeM, x, z) + 0.3;
        return new THREE.Vector3(x, y, z);
      });
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), pathMat));
    };
    _drawLine(def.pathPoints);
    for (const trail of def.branchTrails ?? []) _drawLine(trail);

    if (def.riverPoints && def.riverPoints.length >= 2) {
      const river = _buildRiver(def.riverPoints, def.riverWidthM ?? 6, heights, resolution, sizeM);
      scene.add(river);
    }

    // ── 3. Props ────────────────────────────────────────────────────────────
    const discoverableZones: DiscoverableZoneInfo[] = [];

    for (const prop of def.props) {
      const groundY = _sampleHeight(heights, resolution, sizeM, prop.x, prop.z);

      if (prop.kind === 'vi3w-asset' && prop.assetId) {
        try {
          const entry = AssetRegistry.default.getAsset(prop.assetId);
          // AssetPlacer uses ENU-style (e, n) where threeZ = -n; pass n = -prop.z
          // so the placed mesh lands at THREE.js z === prop.z.
          await placer.place(entry, prop.x, -prop.z);
        } catch (err) {
          console.warn(`[LocalWorldLoader] Failed to place vi3w asset "${prop.assetId}":`, err);
        }
        continue;
      }

      const group = _buildPropMesh(prop);
      if (!group) continue;

      group.position.set(prop.x, groundY, prop.z);
      if (prop.rotationY) group.rotation.y = prop.rotationY;
      if (prop.scale) group.scale.multiplyScalar(prop.scale);
      scene.add(group);

      if (SOLID_KINDS.has(prop.kind)) {
        const box = new THREE.Box3().setFromObject(group);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const colliderDesc = RAPIER.ColliderDesc
          .cuboid(size.x / 2, size.y / 2, size.z / 2)
          .setTranslation(center.x, center.y, center.z);
        physics.world.createCollider(colliderDesc);
      }

      // Labeled landmarks (bridges, viewpoints, temples, …) are discoverable
      // — distinct from vi3w collectibles, which use AssetPlacer's pickup flow.
      if (prop.label) {
        discoverableZones.push({
          id: prop.id, name: prop.label, x: prop.x, y: groundY + 1.2, z: prop.z, radius: 6,
        });
      }
    }

    const spawnY = _sampleHeight(heights, resolution, sizeM, def.spawn.x, def.spawn.z);
    return { spawnY, terrainSizeM: sizeM, discoverableZones };
  }
}
