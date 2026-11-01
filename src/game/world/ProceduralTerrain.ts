import * as THREE from 'three';
import type { TerrainConfig } from './LocalWorldDefinition';

/** Deterministic hash → pseudo-random float in [0, 1). Same seed+coords always produce the same value. */
function _hash(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 2246822519;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 100000) / 100000;
}

/** Smooth 2D value noise via bilinear interpolation of lattice hash values. */
function _valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = x0 + 1, y1 = y0 + 1;
  const sx = x - x0, sy = y - y0;
  const n00 = _hash(x0, y0, seed);
  const n10 = _hash(x1, y0, seed);
  const n01 = _hash(x0, y1, seed);
  const n11 = _hash(x1, y1, seed);
  // Smoothstep interpolation.
  const u = sx * sx * (3 - 2 * sx);
  const v = sy * sy * (3 - 2 * sy);
  const nx0 = n00 * (1 - u) + n10 * u;
  const nx1 = n01 * (1 - u) + n11 * u;
  return (nx0 * (1 - v) + nx1 * v) * 2 - 1; // [-1, 1]
}

/** Fractal brownian motion — layered noise octaves for natural-looking irregularity. */
function _fbm(x: number, y: number, seed: number, octaves: number): number {
  let total = 0, amplitude = 1, frequency = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    total += _valueNoise2D(x * frequency, y * frequency, seed + i * 101) * amplitude;
    maxAmp += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / maxAmp;
}

export interface TerrainResult {
  mesh: THREE.Mesh;
  /** Row-major height grid, [row * resolution + col], matching Rapier heightfield expectations. */
  heights: Float32Array;
  resolution: number;
  sizeM: number;
  maxHeightM: number;
}

/** Rolling desert dune shape: directional ridges + fbm detail, no radial valley. */
function _duneHeight(x: number, z: number, cfg: TerrainConfig): number {
  const ridgeScale = 2.2 / cfg.sizeM;
  // Large, slightly wavy directional ridges (dune crests running roughly NW-SE),
  // phase-shifted by low-frequency noise so they aren't perfectly parallel.
  const wander = _fbm(x * ridgeScale * 0.4, z * ridgeScale * 0.4, cfg.seed + 500, 2) * 2.5;
  const ridgePhase = (x * 0.7 + z * 0.3) * ridgeScale + wander;
  const ridges = (Math.sin(ridgePhase) * 0.5 + 0.5); // 0..1

  const detailScale = 4.5 / cfg.sizeM;
  const detail = _fbm(x * detailScale, z * detailScale, cfg.seed, 5);

  // Ridges dominate the large-scale shape; fbm adds dune-face irregularity.
  return ridges * cfg.maxHeightM * 0.75 + (detail * 0.5 + 0.5) * cfg.maxHeightM * 0.35;
}

/**
 * Height at world (x, z) where x,z range roughly [-size/2, size/2].
 * 'valley' (default): flat-ish floor at centre, rising toward the edges
 * (surrounding peaks). 'dunes': rolling directional desert ridges.
 */
function heightAt(x: number, z: number, cfg: TerrainConfig): number {
  if (cfg.shape === 'dunes') return _duneHeight(x, z, cfg);

  const r = Math.sqrt(x * x + z * z) / (cfg.sizeM / 2); // 0 at centre, ~1 at edge
  // Smooth radial rise, flattened near the centre by valleyFlatness.
  const flat = THREE.MathUtils.clamp(cfg.valleyFlatness, 0, 0.95);
  const shaped = Math.max(0, r - flat) / (1 - flat);
  const ridge = Math.pow(THREE.MathUtils.clamp(shaped, 0, 1), 1.6);

  const noiseScale = 3.0 / cfg.sizeM;
  const detail = _fbm(x * noiseScale, z * noiseScale, cfg.seed, 4);

  return ridge * cfg.maxHeightM + detail * cfg.maxHeightM * 0.12;
}

export function generateProceduralTerrain(cfg: TerrainConfig): TerrainResult {
  const { sizeM, resolution, maxHeightM, colorLow, colorHigh } = cfg;
  const half = sizeM / 2;
  const heights = new Float32Array(resolution * resolution);

  const positions = new Float32Array(resolution * resolution * 3);
  const colors = new Float32Array(resolution * resolution * 3);
  const low = new THREE.Color(colorLow);
  const high = new THREE.Color(colorHigh);
  const tmp = new THREE.Color();

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const x = -half + (col / (resolution - 1)) * sizeM;
      const z = -half + (row / (resolution - 1)) * sizeM;
      const h = heightAt(x, z, cfg);
      const idx = row * resolution + col;
      heights[idx] = h;

      const vi = idx * 3;
      positions[vi] = x;
      positions[vi + 1] = h;
      positions[vi + 2] = z;

      tmp.copy(low).lerp(high, THREE.MathUtils.clamp(h / maxHeightM, 0, 1));
      colors[vi] = tmp.r; colors[vi + 1] = tmp.g; colors[vi + 2] = tmp.b;
    }
  }

  // Two triangles per grid quad.
  const indices: number[] = [];
  for (let row = 0; row < resolution - 1; row++) {
    for (let col = 0; col < resolution - 1; col++) {
      const a = row * resolution + col;
      const b = a + 1;
      const c = a + resolution;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.0,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  return { mesh, heights, resolution, sizeM, maxHeightM };
}
