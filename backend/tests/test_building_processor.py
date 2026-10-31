"""
Tests for building_processor.

Reuses the cached Manali OSM data from P2-03 (no extra network calls if
the .osm_cache is warm).  132 buildings, all Polygons, no height tags
→ all should extrude at the 6 m default.
"""

from __future__ import annotations

import struct

import numpy as np
import pytest
import trimesh

from app.world_builder.building_processor import (
    BuildingMesh,
    _extract_height,
    process_buildings,
)
from app.world_builder.data_fetcher import fetch_osm_data

WEST, SOUTH, EAST, NORTH = 77.183, 32.239, 77.195, 32.248


@pytest.fixture(scope="module")
def osm():
    return fetch_osm_data(WEST, SOUTH, EAST, NORTH)


@pytest.fixture(scope="module")
def buildings(osm, tmp_path_factory) -> BuildingMesh:
    out = tmp_path_factory.mktemp("buildings") / "manali_buildings.glb"
    return process_buildings(
        osm.buildings, WEST, SOUTH, EAST, NORTH, output_path=out
    )


# ── _extract_height unit tests (no I/O) ──────────────────────────────────────

class TestExtractHeight:

    def _row(self, **kwargs):
        """Minimal dict stand-in for a GeoDataFrame row."""
        return kwargs

    def test_explicit_height_metres(self):
        assert _extract_height(self._row(height="12")) == 12.0

    def test_height_with_unit_suffix(self):
        assert _extract_height(self._row(height="8 m")) == 8.0

    def test_building_levels(self):
        assert _extract_height(self._row(**{"building:levels": "3"})) == pytest.approx(10.5)

    def test_levels_fallback(self):
        assert _extract_height(self._row(levels="2")) == pytest.approx(7.0)

    def test_default_when_no_tags(self):
        assert _extract_height(self._row()) == pytest.approx(6.0)

    def test_custom_default(self):
        assert _extract_height(self._row(), default=9.0) == pytest.approx(9.0)

    def test_invalid_height_falls_through(self):
        assert _extract_height(self._row(height="unknown")) == pytest.approx(6.0)

    def test_height_priority_over_levels(self):
        assert _extract_height(self._row(height="15", **{"building:levels": "2"})) == 15.0


# ── Output file ───────────────────────────────────────────────────────────────

class TestOutput:

    def test_glb_written(self, buildings: BuildingMesh):
        assert buildings.glb_path.exists()
        assert buildings.glb_path.stat().st_size > 0

    def test_glb_magic(self, buildings: BuildingMesh):
        with open(buildings.glb_path, "rb") as f:
            magic = struct.unpack("<I", f.read(4))[0]
        assert magic == 0x46546C67, f"Not a valid GLB (magic={hex(magic)})"


# ── Building count ────────────────────────────────────────────────────────────

class TestCounts:

    def test_nonzero_buildings(self, buildings: BuildingMesh):
        assert buildings.building_count > 0

    def test_all_132_extruded(self, buildings: BuildingMesh, osm):
        """All 132 Manali buildings are valid Polygons — none should be skipped."""
        assert buildings.building_count == len(osm.buildings)
        assert buildings.skipped_count == 0

    def test_stats_populated(self, buildings: BuildingMesh):
        s = buildings.stats
        assert s["buildings"] > 0
        assert "height_min_m" in s
        assert "default_pct" in s


# ── Trimesh round-trip ────────────────────────────────────────────────────────

class TestTrimeshRoundtrip:

    def test_loads(self, buildings: BuildingMesh):
        scene = trimesh.load(str(buildings.glb_path))
        assert scene is not None

    def test_has_geometry(self, buildings: BuildingMesh):
        scene = trimesh.load(str(buildings.glb_path))
        geoms = list(scene.geometry.values()) if hasattr(scene, "geometry") else [scene]
        assert len(geoms) > 0

    def test_geometry_count_matches(self, buildings: BuildingMesh):
        scene = trimesh.load(str(buildings.glb_path))
        geoms = list(scene.geometry.values()) if hasattr(scene, "geometry") else [scene]
        assert len(geoms) == buildings.building_count


# ── Height & spatial correctness ──────────────────────────────────────────────

class TestSpatial:

    def test_default_height_applied(self, buildings: BuildingMesh):
        """All Manali buildings lack height tags → 100 % use default 6 m."""
        assert buildings.stats["height_mean_m"] == pytest.approx(6.0)

    def test_z_starts_at_zero(self, buildings: BuildingMesh):
        scene = trimesh.load(str(buildings.glb_path))
        geoms = list(scene.geometry.values()) if hasattr(scene, "geometry") else [scene]
        z_min = min(g.vertices[:, 2].min() for g in geoms)
        assert z_min >= -0.01, f"Lowest Z should be ≥ 0; got {z_min:.3f}"

    def test_z_max_equals_height(self, buildings: BuildingMesh):
        """For uniform 6 m buildings, all rooftops should be at ~6 m."""
        scene = trimesh.load(str(buildings.glb_path))
        geoms = list(scene.geometry.values()) if hasattr(scene, "geometry") else [scene]
        z_max = max(g.vertices[:, 2].max() for g in geoms)
        assert abs(z_max - 6.0) < 0.1, f"Expected roof at 6 m; got {z_max:.3f}"

    def test_buildings_within_bbox_enu(self, buildings: BuildingMesh):
        """All building XY coords should lie within ~1 km of ENU origin."""
        scene = trimesh.load(str(buildings.glb_path))
        geoms = list(scene.geometry.values()) if hasattr(scene, "geometry") else [scene]
        verts = np.vstack([g.vertices for g in geoms])
        max_radius = np.hypot(verts[:, 0], verts[:, 1]).max()
        assert max_radius < 2_000, f"Building {max_radius:.0f} m from origin — unexpected"
