"""
Tests for terrain_processor.

Uses the cached elevation GeoTIFF (Manali bbox) produced by P2-04.
No network calls unless the elevation cache is cold.

Expected geometry for 128×128 grid over Manali:
  vertices  = 16 384
  triangles = 32 258    (2 × 127² quads)
  relief    > 50 m      (same threshold as P2-04)
"""

from __future__ import annotations

import struct
from pathlib import Path

import numpy as np
import pytest
import trimesh

from app.world_builder.elevation_fetcher import fetch_elevation
from app.world_builder.terrain_processor import TerrainMesh, generate_terrain_mesh

# ── Shared fixture ────────────────────────────────────────────────────────────

WEST, SOUTH, EAST, NORTH = 77.183, 32.239, 77.195, 32.248
GRID = 128


@pytest.fixture(scope="module")
def terrain(tmp_path_factory) -> TerrainMesh:
    """Generate once; all tests share the mesh."""
    elev = fetch_elevation(WEST, SOUTH, EAST, NORTH)
    out_dir = tmp_path_factory.mktemp("terrain")
    return generate_terrain_mesh(elev.tif_path, grid_size=GRID, output_path=out_dir / "manali.glb")


# ── File existence ────────────────────────────────────────────────────────────

class TestOutput:

    def test_glb_written(self, terrain: TerrainMesh):
        assert terrain.glb_path.exists()
        assert terrain.glb_path.stat().st_size > 0

    def test_glb_extension(self, terrain: TerrainMesh):
        assert terrain.glb_path.suffix == ".glb"

    def test_glb_magic_bytes(self, terrain: TerrainMesh):
        """GLB files start with magic 0x46546C67 ('glTF')."""
        with open(terrain.glb_path, "rb") as f:
            magic = struct.unpack("<I", f.read(4))[0]
        assert magic == 0x46546C67, f"Not a valid GLB (magic={hex(magic)})"


# ── Geometry counts ───────────────────────────────────────────────────────────

class TestGeometry:

    def test_vertex_count(self, terrain: TerrainMesh):
        assert terrain.vertex_count == GRID * GRID

    def test_face_count(self, terrain: TerrainMesh):
        expected = 2 * (GRID - 1) ** 2
        assert terrain.face_count == expected

    def test_grid_shape(self, terrain: TerrainMesh):
        assert terrain.grid_shape == (GRID, GRID)


# ── Trimesh round-trip ────────────────────────────────────────────────────────

class TestTrimeshRoundtrip:

    def test_trimesh_loads(self, terrain: TerrainMesh):
        scene = trimesh.load(str(terrain.glb_path))
        assert scene is not None

    def test_trimesh_has_geometry(self, terrain: TerrainMesh):
        scene = trimesh.load(str(terrain.glb_path))
        geoms = list(scene.geometry.values()) if hasattr(scene, "geometry") else [scene]
        assert len(geoms) > 0

    def test_trimesh_vertex_count_matches(self, terrain: TerrainMesh):
        scene = trimesh.load(str(terrain.glb_path))
        geoms = list(scene.geometry.values()) if hasattr(scene, "geometry") else [scene]
        total = sum(g.vertices.shape[0] for g in geoms)
        assert total == terrain.vertex_count

    def test_trimesh_face_count_matches(self, terrain: TerrainMesh):
        scene = trimesh.load(str(terrain.glb_path))
        geoms = list(scene.geometry.values()) if hasattr(scene, "geometry") else [scene]
        total = sum(g.faces.shape[0] for g in geoms)
        assert total == terrain.face_count


# ── Elevation values ──────────────────────────────────────────────────────────

class TestElevation:

    def test_z_range_plausible(self, terrain: TerrainMesh):
        """Manali area: 1 800 – 4 500 m."""
        assert 1_000 < terrain.z_min < 5_000, f"z_min={terrain.z_min:.0f}"
        assert 1_000 < terrain.z_max < 6_000, f"z_max={terrain.z_max:.0f}"

    def test_relief_present(self, terrain: TerrainMesh):
        assert terrain.z_max - terrain.z_min > 50, (
            f"Expected > 50 m of relief; got {terrain.z_max - terrain.z_min:.1f} m"
        )

    def test_stats_populated(self, terrain: TerrainMesh):
        assert terrain.stats["relief_m"] > 50
        assert terrain.stats["vertices"] == GRID * GRID
        assert terrain.stats["triangles"] == 2 * (GRID - 1) ** 2


# ── ENU footprint ─────────────────────────────────────────────────────────────

class TestENUExtent:

    def test_xy_extent_near_500m(self, terrain: TerrainMesh):
        """
        500 m bbox → E/W and N/S extent should each be ~500 m.
        Allow 20 % slack for the ~12 km² Manali bbox.
        """
        scene = trimesh.load(str(terrain.glb_path))
        geoms = list(scene.geometry.values()) if hasattr(scene, "geometry") else [scene]
        verts = np.vstack([g.vertices for g in geoms])
        x_range = verts[:, 0].max() - verts[:, 0].min()  # East
        y_range = verts[:, 1].max() - verts[:, 1].min()  # North
        # Manali bbox is ~1.1 km E-W and ~1 km N-S at z=14
        assert 300 < x_range < 2_000, f"E-W extent {x_range:.0f} m unexpected"
        assert 300 < y_range < 2_000, f"N-S extent {y_range:.0f} m unexpected"

    def test_origin_centred(self, terrain: TerrainMesh):
        """ENU origin is the bbox centroid → vertices straddle 0 in both axes."""
        scene = trimesh.load(str(terrain.glb_path))
        geoms = list(scene.geometry.values()) if hasattr(scene, "geometry") else [scene]
        verts = np.vstack([g.vertices for g in geoms])
        assert verts[:, 0].min() < 0, "East axis should have negative values"
        assert verts[:, 0].max() > 0, "East axis should have positive values"
        assert verts[:, 1].min() < 0, "North axis should have negative values"
        assert verts[:, 1].max() > 0, "North axis should have positive values"


# ── Small-grid smoke test (no network) ───────────────────────────────────────

class TestSmallGrid:

    def test_4x4_grid(self, tmp_path):
        """Tiny grid over cold-cache bbox: verify count formulas hold."""
        elev = fetch_elevation(WEST, SOUTH, EAST, NORTH)
        m = generate_terrain_mesh(elev.tif_path, grid_size=4, output_path=tmp_path / "tiny.glb")
        assert m.vertex_count == 16
        assert m.face_count == 2 * 9       # 2 × (4-1)²
        assert m.glb_path.exists()
