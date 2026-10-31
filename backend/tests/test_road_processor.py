"""
Tests for road_processor.

Reuses cached Manali OSM data (no network if .osm_cache is warm).
307 road edges, 308 unique nodes expected.
"""

from __future__ import annotations

import json
import math

import pytest

from app.world_builder.data_fetcher import fetch_osm_data
from app.world_builder.road_processor import (
    RoadGraph,
    _coerce_str,
    _extract_type,
    build_road_graph,
    validate_road_graph,
)

WEST, SOUTH, EAST, NORTH = 77.183, 32.239, 77.195, 32.248


@pytest.fixture(scope="module")
def osm():
    return fetch_osm_data(WEST, SOUTH, EAST, NORTH)


@pytest.fixture(scope="module")
def graph(osm) -> RoadGraph:
    return build_road_graph(osm.roads, WEST, SOUTH, EAST, NORTH)


# ── _coerce_str unit tests ────────────────────────────────────────────────────

class TestCoerceStr:

    def test_plain_string(self):
        assert _coerce_str("highway") == "highway"

    def test_none(self):
        assert _coerce_str(None) is None

    def test_nan(self):
        assert _coerce_str(float("nan")) is None

    def test_list_unwrap(self):
        assert _coerce_str(["primary", "secondary"]) == "primary"

    def test_empty_list(self):
        assert _coerce_str([]) is None

    def test_empty_string(self):
        assert _coerce_str("") is None


# ── _extract_type unit tests ──────────────────────────────────────────────────

class TestExtractType:

    def _row(self, **kwargs):
        return kwargs

    def test_highway_wins(self):
        assert _extract_type(self._row(highway="primary", ref="NH3")) == "primary"

    def test_ref_fallback(self):
        assert _extract_type(self._row(ref="NH3")) == "NH3"

    def test_name_fallback(self):
        assert _extract_type(self._row(name="Mall Road")) == "Mall Road"

    def test_default_road(self):
        assert _extract_type(self._row()) == "road"

    def test_none_highway_falls_through(self):
        assert _extract_type(self._row(highway=None, name="Old Manali Road")) == "Old Manali Road"


# ── Graph structure ───────────────────────────────────────────────────────────

class TestGraphStructure:

    def test_nodes_nonempty(self, graph: RoadGraph):
        assert len(graph.nodes) > 0

    def test_edges_nonempty(self, graph: RoadGraph):
        assert len(graph.edges) > 0

    def test_node_count_matches_stats(self, graph: RoadGraph):
        assert graph.stats["node_count"] == len(graph.nodes)

    def test_edge_count_matches_stats(self, graph: RoadGraph):
        assert graph.stats["edge_count"] == len(graph.edges)

    def test_manali_node_count(self, graph: RoadGraph):
        """Manali bbox should yield > 100 unique nodes."""
        assert len(graph.nodes) > 100

    def test_manali_edge_count(self, graph: RoadGraph):
        """307 road edges should all be preserved."""
        assert len(graph.edges) == 307

    def test_total_length_positive(self, graph: RoadGraph):
        assert graph.stats["total_length_m"] > 0


# ── Node schema ───────────────────────────────────────────────────────────────

class TestNodeSchema:

    def test_id_is_int(self, graph: RoadGraph):
        for node in graph.nodes:
            assert isinstance(node["id"], int)

    def test_enu_has_e_and_n(self, graph: RoadGraph):
        for node in graph.nodes:
            assert "e" in node["enu"]
            assert "n" in node["enu"]

    def test_enu_values_are_floats(self, graph: RoadGraph):
        for node in graph.nodes:
            assert isinstance(node["enu"]["e"], float)
            assert isinstance(node["enu"]["n"], float)

    def test_enu_within_bbox_extent(self, graph: RoadGraph):
        """ENU coords should be within ~1 km of origin for this bbox."""
        for node in graph.nodes:
            dist = math.hypot(node["enu"]["e"], node["enu"]["n"])
            assert dist < 2_000, f"Node {node['id']} is {dist:.0f} m from origin"


# ── Edge schema ───────────────────────────────────────────────────────────────

class TestEdgeSchema:

    def test_a_b_are_ints(self, graph: RoadGraph):
        for edge in graph.edges:
            assert isinstance(edge["a"], int)
            assert isinstance(edge["b"], int)

    def test_type_is_str(self, graph: RoadGraph):
        for edge in graph.edges:
            assert isinstance(edge["type"], str)
            assert len(edge["type"]) > 0

    def test_length_positive(self, graph: RoadGraph):
        for edge in graph.edges:
            assert edge["length_m"] >= 0

    def test_endpoints_in_node_set(self, graph: RoadGraph):
        node_ids = {n["id"] for n in graph.nodes}
        for edge in graph.edges:
            assert edge["a"] in node_ids, f"edge.a={edge['a']} not in nodes"
            assert edge["b"] in node_ids, f"edge.b={edge['b']} not in nodes"


# ── validate_road_graph ───────────────────────────────────────────────────────

class TestValidation:

    def test_valid_graph_no_errors(self, graph: RoadGraph):
        errors = validate_road_graph(graph.to_dict())
        assert errors == [], f"Validation errors: {errors}"

    def test_missing_nodes_key(self):
        errors = validate_road_graph({"edges": [], "bbox": {}})
        assert any("nodes" in e for e in errors)

    def test_missing_edges_key(self):
        errors = validate_road_graph({"nodes": [], "bbox": {}})
        assert any("edges" in e for e in errors)

    def test_bad_node_id_type(self):
        bad = {
            "nodes": [{"id": "string-id", "enu": {"e": 0.0, "n": 0.0}}],
            "edges": [],
            "bbox": {"west": 0, "south": 0, "east": 1, "north": 1},
        }
        errors = validate_road_graph(bad)
        assert any("id" in e for e in errors)

    def test_missing_enu_field(self):
        bad = {
            "nodes": [{"id": 1, "enu": {"e": 0.0}}],  # missing 'n'
            "edges": [],
            "bbox": {"west": 0, "south": 0, "east": 1, "north": 1},
        }
        errors = validate_road_graph(bad)
        assert any("enu.n" in e for e in errors)


# ── Serialisation ─────────────────────────────────────────────────────────────

class TestSerialisation:

    def test_to_dict_structure(self, graph: RoadGraph):
        d = graph.to_dict()
        assert set(d.keys()) >= {"nodes", "edges", "bbox", "stats"}

    def test_json_round_trip(self, graph: RoadGraph):
        raw = json.dumps(graph.to_dict())
        parsed = json.loads(raw)
        assert len(parsed["nodes"]) == len(graph.nodes)
        assert len(parsed["edges"]) == len(graph.edges)

    def test_save_writes_file(self, graph: RoadGraph, tmp_path):
        out = tmp_path / "roads.json"
        graph.save(out)
        assert out.exists()
        data = json.loads(out.read_text())
        assert len(data["nodes"]) > 0

    def test_bbox_in_output(self, graph: RoadGraph):
        d = graph.to_dict()
        bbox = d["bbox"]
        assert bbox["west"]  == pytest.approx(WEST)
        assert bbox["south"] == pytest.approx(SOUTH)
        assert bbox["east"]  == pytest.approx(EAST)
        assert bbox["north"] == pytest.approx(NORTH)
