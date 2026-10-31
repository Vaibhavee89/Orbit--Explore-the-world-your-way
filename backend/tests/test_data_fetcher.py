"""
Integration test for OSM data fetcher.

Makes one real Overpass API call on first run; subsequent runs are instant
because the result is cached to .osm_cache/.

Manali bbox (~500 m square centred on Old Manali Road):
  west=77.183, south=32.239, east=77.195, north=32.248
"""

import json
from pathlib import Path

import pytest

from app.world_builder.data_fetcher import fetch_osm_data, _bbox_hash, _CACHE_DIR

# ── small but non-trivial Manali bbox ────────────────────────────────────────
WEST, SOUTH, EAST, NORTH = 77.183, 32.239, 77.195, 32.248


@pytest.fixture(scope="module")
def osm_data():
    """Fetch once; all tests in this module share the result."""
    return fetch_osm_data(WEST, SOUTH, EAST, NORTH)


class TestFetchReturnsData:

    def test_has_roads(self, osm_data):
        assert len(osm_data.roads) > 0, "Expected at least one road segment"

    def test_has_buildings(self, osm_data):
        assert len(osm_data.buildings) > 0, "Expected at least one building polygon"

    def test_roads_have_geometry(self, osm_data):
        assert osm_data.roads.geometry.notna().all()
        assert not osm_data.roads.geometry.is_empty.any()

    def test_buildings_have_geometry(self, osm_data):
        nonempty = osm_data.buildings[~osm_data.buildings.geometry.is_empty]
        assert len(nonempty) > 0

    def test_stats_populated(self, osm_data):
        s = osm_data.stats
        assert s["roads"] > 0
        assert s["buildings"] > 0


class TestCache:

    def test_cache_file_written(self, osm_data):
        h = _bbox_hash(WEST, SOUTH, EAST, NORTH)
        meta = _CACHE_DIR / f"{h}_meta.json"
        assert meta.exists(), "meta.json cache file should exist after fetch"

    def test_second_call_is_cached(self):
        data2 = fetch_osm_data(WEST, SOUTH, EAST, NORTH)
        assert data2.from_cache is True, "Second call must hit disk cache"

    def test_cache_meta_contains_stats(self):
        h = _bbox_hash(WEST, SOUTH, EAST, NORTH)
        meta_path = _CACHE_DIR / f"{h}_meta.json"
        meta = json.loads(meta_path.read_text())
        assert "fetched_at" in meta
        assert meta["stats"]["roads"] > 0
        assert meta["stats"]["buildings"] > 0

    def test_force_refresh_bypasses_cache(self):
        data = fetch_osm_data(WEST, SOUTH, EAST, NORTH, force_refresh=True)
        assert data.from_cache is False


class TestGeoJSON:

    def test_to_geojson_structure(self, osm_data):
        gj = osm_data.to_geojson()
        assert gj["type"] == "FeatureCollection"
        assert isinstance(gj["features"], list)
        assert len(gj["features"]) > 0

    def test_geojson_has_road_and_building_layers(self, osm_data):
        gj = osm_data.to_geojson()
        layers = {f["properties"]["_layer"] for f in gj["features"]}
        assert "road" in layers
        assert "building" in layers

    def test_geojson_is_serialisable(self, osm_data):
        gj = osm_data.to_geojson()
        serialised = json.dumps(gj)
        assert len(serialised) > 100

    def test_bbox_in_geojson(self, osm_data):
        gj = osm_data.to_geojson()
        assert gj["bbox"] == [WEST, SOUTH, EAST, NORTH]
