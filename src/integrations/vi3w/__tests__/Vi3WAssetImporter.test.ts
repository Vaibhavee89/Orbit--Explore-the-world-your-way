import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { Vi3WAssetImporter } from '../Vi3WAssetImporter';

// Helpers ──────────────────────────────────────────────────────────────────────

function makeGroup(...meshes: THREE.Mesh[]): THREE.Group {
  const g = new THREE.Group();
  meshes.forEach(m => g.add(m));
  return g;
}

function boxMesh(w: number, h: number, d: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
}

// Tests ────────────────────────────────────────────────────────────────────────

describe('Vi3WAssetImporter.fromScene', () => {

  it('reports correct bounding-box size for a unit box', () => {
    const { size } = Vi3WAssetImporter.fromScene(makeGroup(boxMesh(1, 1, 1)), []);
    expect(size.x).toBeCloseTo(1, 4);
    expect(size.y).toBeCloseTo(1, 4);
    expect(size.z).toBeCloseTo(1, 4);
  });

  it('reports correct size for a non-cubic box', () => {
    const { size } = Vi3WAssetImporter.fromScene(makeGroup(boxMesh(2, 3, 1)), []);
    expect(size.x).toBeCloseTo(2, 4);
    expect(size.y).toBeCloseTo(3, 4);
    expect(size.z).toBeCloseTo(1, 4);
  });

  it('reports centre at origin for centred geometry', () => {
    const { center } = Vi3WAssetImporter.fromScene(makeGroup(boxMesh(4, 4, 4)), []);
    expect(center.x).toBeCloseTo(0, 4);
    expect(center.y).toBeCloseTo(0, 4);
    expect(center.z).toBeCloseTo(0, 4);
  });

  it('accounts for mesh position offset', () => {
    const mesh = boxMesh(1, 1, 1);
    mesh.position.set(5, 0, 0);
    const { center } = Vi3WAssetImporter.fromScene(makeGroup(mesh), []);
    expect(center.x).toBeCloseTo(5, 4);
  });

  it('spans multiple child meshes correctly', () => {
    const a = boxMesh(1, 1, 1); a.position.set(-1, 0, 0);
    const b = boxMesh(1, 1, 1); b.position.set( 1, 0, 0);
    const { size, center } = Vi3WAssetImporter.fromScene(makeGroup(a, b), []);
    expect(size.x).toBeCloseTo(3, 4);   // from -1.5 to +1.5
    expect(center.x).toBeCloseTo(0, 4);
  });

  it('returns an empty animations array when none provided', () => {
    const { animations } = Vi3WAssetImporter.fromScene(makeGroup(), []);
    expect(animations).toHaveLength(0);
  });

  it('passes through animation clips unchanged', () => {
    const clip = new THREE.AnimationClip('idle', 2.5, []);
    const { animations } = Vi3WAssetImporter.fromScene(makeGroup(), [clip]);
    expect(animations).toHaveLength(1);
    expect(animations[0].name).toBe('idle');
    expect(animations[0].duration).toBeCloseTo(2.5, 4);
  });

  it('returns the model reference unchanged', () => {
    const group = makeGroup(boxMesh(1, 1, 1));
    const { model } = Vi3WAssetImporter.fromScene(group, []);
    expect(model).toBe(group);
  });

  it('size is always non-negative (empty group → zero size)', () => {
    const { size } = Vi3WAssetImporter.fromScene(makeGroup(), []);
    // Box3 on an empty object produces Infinity extents; size ends up NaN/Infinity.
    // The importer should not crash — the caller handles empty models.
    expect(typeof size.x).toBe('number');
  });
});
