import * as THREE from 'three';
import type { WorldManifest } from '../../geospatial/WorldBuilderClient';
import type { SceneManager } from '../rendering/SceneManager';

const DEFAULT_BASE_URL = 'http://localhost:8000';

function _backendBase(): string {
  const url = (typeof process !== 'undefined' && process.env.VITE_WORLDBUILDER_API_URL) || '';
  return url || DEFAULT_BASE_URL;
}

interface RoadNode {
  id: number;
  enu: { e: number; n: number };
}

interface RoadEdge {
  a: number;
  b: number;
  type: string;
  length_m: number;
}

interface RoadGraph {
  nodes: RoadNode[];
  edges: RoadEdge[];
}

// Offset above the zero-elevation terrain baseline to avoid z-fighting.
const ROAD_Y_OFFSET = 1.5;

export class RoadLoader {
  async load(manifest: WorldManifest, scene: SceneManager): Promise<THREE.LineSegments> {
    const url = `${_backendBase()}${manifest.asset_urls['roads']}`;
    const graph: RoadGraph = await fetch(url).then(r => r.json());

    // Build node lookup: id → ENU (e, n).
    const nodeMap = new Map<number, { e: number; n: number }>();
    for (const node of graph.nodes) nodeMap.set(node.id, node.enu);

    // Two vertices per edge, three floats each.
    const positions = new Float32Array(graph.edges.length * 6);
    let cursor = 0;
    let drawnEdges = 0;

    for (const edge of graph.edges) {
      const a = nodeMap.get(edge.a);
      const b = nodeMap.get(edge.b);
      if (!a || !b) continue;

      // ENU (e, n) → Three.js (x, y, z) matching terrain rotation.x = -π/2:
      //   world.x = ENU.east,  world.y = elevation(≈0) + offset,  world.z = -ENU.north
      positions[cursor++] = a.e;
      positions[cursor++] = ROAD_Y_OFFSET;
      positions[cursor++] = -a.n;
      positions[cursor++] = b.e;
      positions[cursor++] = ROAD_Y_OFFSET;
      positions[cursor++] = -b.n;
      drawnEdges++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, drawnEdges * 6), 3));

    const mat = new THREE.LineBasicMaterial({ color: 0xfbbf24, linewidth: 1 });
    const lines = new THREE.LineSegments(geo, mat);

    scene.add(lines);
    return lines;
  }
}
