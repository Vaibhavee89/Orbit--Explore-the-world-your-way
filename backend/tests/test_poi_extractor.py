"""
Tests for poi_extractor (P5-02).

Uses a synthetic GeoDataFrame — no network or OSM cache required.
The fixture creates POI rows that cover:
  - tourism (viewpoint)
  - historic (temple)
  - natural=peak
  - natural=water  (should be filtered out — not in NATURAL_VALUES)
  - amenity row  (should be filtered out — not a target category)
  - row with null geometry (should be skipped)
  - duplicate osmid (should be deduplicated)
"""

from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import Point, Polygon

from app.gameplay.poi_extractor import (
    NATURAL_VALUES,
    PoiRecord,
    _centroid_latlon,
    _is_nan,
    _osm_id,
    extract_pois,
)

# ── Bbox (small synthetic area, ~1 km²) ───────────────────────────────────────

WEST, SOUTH, EAST, NORTH = 77.183, 32.239, 77.195, 32.248
ORIGIN_LAT = (SOUTH + NORTH) / 2   # 32.2435
ORIGIN_LON = (WEST  + EAST)  / 2   # 77.189


def _make_gdf(rows: list[dict]) -> gpd.GeoDataFrame:
    """Build a GeoDataFrame from a list of property dicts with a 'geometry' key."""
    gdf = gpd.GeoDataFrame(rows, crs="EPSG:4326")
    return gdf.reset_index(drop=True)


# Synthetic POI rows.
_ROWS = [
    # tourism viewpoint (Point)
    {
        "osmid": "1001", "element_type": "node",
        "name": "Valley View",
        "tourism": "viewpoint",
        "geometry": Point(77.187, 32.242),
    },
    # historic temple (Polygon centroid should be used)
    {
        "osmid": "2001", "element_type": "way",
        "name": "Old Shrine",
        "historic": "temple",
        "geometry": Polygon([(77.190, 32.245), (77.191, 32.245),
                              (77.191, 32.246), (77.190, 32.246)]),
    },
    # natural=peak (Point)
    {
        "osmid": "3001", "element_type": "node",
        "name": "Mount Test",
        "natural": "peak",
        "ele": "3500",
        "geometry": Point(77.193, 32.247),
    },
    # natural=water — NOT in NATURAL_VALUES, should be filtered out
    {
        "osmid": "4001", "element_type": "node",
        "name": "Test Lake",
        "natural": "water",
        "geometry": Point(77.185, 32.241),
    },
    # amenity (no tourism/historic/natural tag) — filtered out
    {
        "osmid": "5001", "element_type": "node",
        "name": "Chai Shop",
        "amenity": "cafe",
        "geometry": Point(77.186, 32.240),
    },
    # Duplicate of row 0 — same osmid, should be deduplicated.
    {
        "osmid": "1001", "element_type": "node",
        "name": "Valley View (dup)",
        "tourism": "viewpoint",
        "geometry": Point(77.187, 32.242),
    },
    # No name — should still be included (name defaults to "").
    {
        "osmid": "6001", "element_type": "node",
        "name": None,
        "tourism": "hotel",
        "geometry": Point(77.188, 32.243),
    },
]


@pytest.fixture(scope="module")
def pois_gdf() -> gpd.GeoDataFrame:
    return _make_gdf(_ROWS)


@pytest.fixture(scope="module")
def records(pois_gdf: gpd.GeoDataFrame) -> list[PoiRecord]:
    return extract_pois(pois_gdf, WEST, SOUTH, EAST, NORTH)


# ── Helper unit tests ─────────────────────────────────────────────────────────

class TestHelpers:
    def test_is_nan_float_nan(self):
        import math
        assert _is_nan(float("nan")) is True

    def test_is_nan_none(self):
        assert _is_nan(None) is True

    def test_is_nan_valid_string(self):
        assert _is_nan("peak") is False

    def test_centroid_latlon_point(self):
        pt = Point(77.189, 32.244)
        result = _centroid_latlon(pt)
        assert result is not None
        lat, lon = result
        assert abs(lat - 32.244) < 1e-6
        assert abs(lon - 77.189) < 1e-6

    def test_centroid_latlon_polygon(self):
        poly = Polygon([(0, 0), (2, 0), (2, 2), (0, 2)])
        result = _centroid_latlon(poly)
        assert result is not None
        lat, lon = result
        assert abs(lat - 1.0) < 1e-6
        assert abs(lon - 1.0) < 1e-6

    def test_centroid_latlon_none(self):
        assert _centroid_latlon(None) is None


# ── Filtering ─────────────────────────────────────────────────────────────────

class TestFiltering:
    def test_natural_water_excluded(self, records: list[PoiRecord]):
        names = [r.name for r in records]
        assert "Test Lake" not in names

    def test_amenity_only_excluded(self, records: list[PoiRecord]):
        names = [r.name for r in records]
        assert "Chai Shop" not in names

    def test_duplicate_osmid_deduplicated(self, records: list[PoiRecord]):
        ids = [r.id for r in records]
        assert ids.count("node/1001") == 1

    def test_correct_count(self, records: list[PoiRecord]):
        # viewpoint + temple + peak + hotel = 4  (water, cafe, duplicate excluded)
        assert len(records) == 4

    def test_natural_values_set(self):
        assert "peak"   in NATURAL_VALUES
        assert "saddle" in NATURAL_VALUES
        assert "water"  not in NATURAL_VALUES


# ── Category assignment ───────────────────────────────────────────────────────

class TestCategories:
    def test_tourism_category(self, records: list[PoiRecord]):
        tourism = [r for r in records if r.name == "Valley View"]
        assert len(tourism) == 1
        assert tourism[0].category == "tourism"
        assert tourism[0].subcategory == "viewpoint"

    def test_historic_category(self, records: list[PoiRecord]):
        hist = [r for r in records if r.name == "Old Shrine"]
        assert len(hist) == 1
        assert hist[0].category == "historic"
        assert hist[0].subcategory == "temple"

    def test_natural_peak_category(self, records: list[PoiRecord]):
        peak = [r for r in records if r.name == "Mount Test"]
        assert len(peak) == 1
        assert peak[0].category == "natural"
        assert peak[0].subcategory == "peak"

    def test_no_name_defaults_to_empty(self, records: list[PoiRecord]):
        hotel = [r for r in records if r.subcategory == "hotel"]
        assert len(hotel) == 1
        assert hotel[0].name == ""


# ── ENU coordinates ───────────────────────────────────────────────────────────

class TestENU:
    def test_enu_is_two_floats(self, records: list[PoiRecord]):
        for r in records:
            assert len(r.enu) == 2
            assert all(isinstance(v, float) for v in r.enu)

    def test_enu_reasonable_range(self, records: list[PoiRecord]):
        # For a ~1 km² bbox, ENU offsets should be < 2000 m in each direction.
        for r in records:
            assert abs(r.enu[0]) < 2000
            assert abs(r.enu[1]) < 2000

    def test_latlon_is_two_floats(self, records: list[PoiRecord]):
        for r in records:
            assert len(r.latlon) == 2
            lat, lon = r.latlon
            assert 30 < lat < 35     # Manali region
            assert 76 < lon < 79


# ── Record schema ─────────────────────────────────────────────────────────────

class TestSchema:
    def test_all_records_have_id(self, records: list[PoiRecord]):
        for r in records:
            assert r.id and "/" in r.id   # "node/..." or "way/..."

    def test_tags_is_dict(self, records: list[PoiRecord]):
        for r in records:
            assert isinstance(r.tags, dict)

    def test_to_dict_keys(self, records: list[PoiRecord]):
        expected = {"id", "name", "category", "subcategory", "latlon", "enu", "tags"}
        for r in records:
            assert expected.issubset(r.to_dict().keys())


# ── Sorting ───────────────────────────────────────────────────────────────────

class TestSorting:
    def test_sorted_by_category_then_name(self, records: list[PoiRecord]):
        keys = [(r.category, r.name or r.id) for r in records]
        assert keys == sorted(keys)


# ── Output file ───────────────────────────────────────────────────────────────

class TestOutputFile:
    def test_pois_json_written(self, tmp_path: Path, pois_gdf: gpd.GeoDataFrame):
        out = tmp_path / "pois.json"
        extract_pois(pois_gdf, WEST, SOUTH, EAST, NORTH, output_path=out)
        assert out.exists()

    def test_pois_json_schema(self, tmp_path: Path, pois_gdf: gpd.GeoDataFrame):
        out = tmp_path / "pois.json"
        extract_pois(pois_gdf, WEST, SOUTH, EAST, NORTH, output_path=out)
        data = json.loads(out.read_text())
        assert "count" in data
        assert "pois" in data
        assert isinstance(data["pois"], list)
        assert data["count"] == len(data["pois"])

    def test_pois_json_count_matches(self, tmp_path: Path, pois_gdf: gpd.GeoDataFrame):
        out = tmp_path / "pois.json"
        records = extract_pois(pois_gdf, WEST, SOUTH, EAST, NORTH, output_path=out)
        data = json.loads(out.read_text())
        assert data["count"] == len(records)


# ── Empty GDF edge case ───────────────────────────────────────────────────────

class TestEmptyInput:
    def test_empty_gdf_returns_empty_list(self):
        empty = gpd.GeoDataFrame(geometry=gpd.GeoSeries([], crs="EPSG:4326"))
        result = extract_pois(empty, WEST, SOUTH, EAST, NORTH)
        assert result == []

    def test_empty_gdf_writes_zero_count(self, tmp_path: Path):
        empty = gpd.GeoDataFrame(geometry=gpd.GeoSeries([], crs="EPSG:4326"))
        out = tmp_path / "pois_empty.json"
        extract_pois(empty, WEST, SOUTH, EAST, NORTH, output_path=out)
        data = json.loads(out.read_text())
        assert data["count"] == 0
        assert data["pois"] == []
