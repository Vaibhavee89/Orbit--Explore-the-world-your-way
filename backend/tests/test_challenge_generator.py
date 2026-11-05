"""
Tests for challenge_generator (P5-03).

Uses fully synthetic terrain summary + named features + POI records.
No network or filesystem fixtures beyond tmp_path.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.gameplay.challenge_generator import (
    _challenge_id,
    _challenge_difficulty,
    _relief_difficulty,
    _slope_difficulty,
    generate_challenges,
)

# ── Synthetic world data ───────────────────────────────────────────────────────

WORLD_ID = "aabbccddeeff0011"

TERRAIN_SUMMARY_MIXED = {
    "flat_pct":       20.0,
    "easy_pct":       30.0,
    "moderate_pct":   25.0,
    "steep_pct":      15.0,
    "cliff_pct":      10.0,
    "mean_slope_deg": 14.5,
    "max_slope_deg":  42.0,
}

NAMED_FEATURES_FULL = [
    {"type": "summit",     "enu": [300.0, 250.0], "elevation_m": 3500.0, "slope_deg": 8.0},
    {"type": "summit",     "enu": [200.0, 150.0], "elevation_m": 3200.0, "slope_deg": 5.0},
    {"type": "valley",     "enu": [-200.0, -180.0], "elevation_m": 2800.0},
    {"type": "cliff_zone", "centroid_enu": [100.0, 50.0], "cell_count": 12, "mean_slope_deg": 38.0},
]

POI_RECORDS_FULL = [
    {
        "id": "node/1001", "name": "Rohtang Pass", "category": "natural",
        "subcategory": "peak", "latlon": [32.37, 77.24], "enu": [350.0, 410.0], "tags": {},
    },
    {
        "id": "node/2001", "name": "Hadimba Temple", "category": "historic",
        "subcategory": "temple", "latlon": [32.24, 77.18], "enu": [-80.0, 20.0], "tags": {},
    },
    {
        "id": "node/3001", "name": "Mountain View", "category": "tourism",
        "subcategory": "viewpoint", "latlon": [32.25, 77.19], "enu": [30.0, 80.0], "tags": {},
    },
]

# Minimal: no summits, no POIs, flat terrain — tests fallback paths.
TERRAIN_SUMMARY_FLAT = {
    "flat_pct": 95.0, "easy_pct": 5.0, "moderate_pct": 0.0,
    "steep_pct": 0.0, "cliff_pct": 0.0,
    "mean_slope_deg": 1.2, "max_slope_deg": 4.0,
}
NAMED_FEATURES_FLAT  = []
POI_RECORDS_EMPTY    = []


@pytest.fixture(scope="module")
def challenges_full():
    return generate_challenges(
        WORLD_ID,
        terrain_summary=TERRAIN_SUMMARY_MIXED,
        named_features=NAMED_FEATURES_FULL,
        poi_records=POI_RECORDS_FULL,
        z_min=2700.0,
        z_max=3500.0,
        east_half=500.0,
        north_half=500.0,
    )


@pytest.fixture(scope="module")
def challenges_flat():
    return generate_challenges(
        WORLD_ID,
        terrain_summary=TERRAIN_SUMMARY_FLAT,
        named_features=NAMED_FEATURES_FLAT,
        poi_records=POI_RECORDS_EMPTY,
        z_min=100.0,
        z_max=104.0,
        east_half=300.0,
        north_half=300.0,
    )


# ── Helper unit tests ─────────────────────────────────────────────────────────

class TestHelpers:
    def test_challenge_id_is_12_hex_chars(self):
        cid = _challenge_id("worldabc", "navigation", 0)
        assert len(cid) == 12
        assert all(c in "0123456789abcdef" for c in cid)

    def test_challenge_id_deterministic(self):
        a = _challenge_id("worldabc", "elevation", 1)
        b = _challenge_id("worldabc", "elevation", 1)
        assert a == b

    def test_challenge_id_differs_by_type(self):
        a = _challenge_id("world", "navigation", 0)
        b = _challenge_id("world", "elevation", 0)
        assert a != b

    def test_challenge_id_differs_by_index(self):
        a = _challenge_id("world", "navigation", 0)
        b = _challenge_id("world", "navigation", 1)
        assert a != b

    def test_challenge_difficulty_mapping(self):
        assert _challenge_difficulty("flat") == "easy"
        assert _challenge_difficulty("cliff") == "extreme"

    def test_relief_difficulty_flat(self):
        assert _relief_difficulty(100, 130) == "easy"

    def test_relief_difficulty_extreme(self):
        assert _relief_difficulty(1000, 2000) == "extreme"

    def test_slope_difficulty(self):
        assert _slope_difficulty(2.0)  == "easy"
        assert _slope_difficulty(20.0) == "hard"
        assert _slope_difficulty(30.0) == "extreme"


# ── Schema ────────────────────────────────────────────────────────────────────

REQUIRED_KEYS = {"id", "type", "title", "description", "difficulty", "reward_xp", "params"}
VALID_TYPES   = {"navigation", "elevation", "discovery", "route_select", "environmental"}
VALID_DIFFS   = {"easy", "medium", "hard", "extreme"}

class TestSchema:
    def test_returns_list(self, challenges_full):
        assert isinstance(challenges_full, list)

    def test_each_challenge_has_required_keys(self, challenges_full):
        for c in challenges_full:
            assert REQUIRED_KEYS.issubset(c.keys()), f"Missing keys in {c}"

    def test_type_is_valid(self, challenges_full):
        for c in challenges_full:
            assert c["type"] in VALID_TYPES

    def test_difficulty_is_valid(self, challenges_full):
        for c in challenges_full:
            assert c["difficulty"] in VALID_DIFFS

    def test_reward_xp_is_positive_int(self, challenges_full):
        for c in challenges_full:
            assert isinstance(c["reward_xp"], int)
            assert c["reward_xp"] > 0

    def test_params_is_dict(self, challenges_full):
        for c in challenges_full:
            assert isinstance(c["params"], dict)

    def test_id_is_12_hex(self, challenges_full):
        for c in challenges_full:
            assert len(c["id"]) == 12
            assert all(ch in "0123456789abcdef" for ch in c["id"])

    def test_all_ids_unique(self, challenges_full):
        ids = [c["id"] for c in challenges_full]
        assert len(ids) == len(set(ids))


# ── Rule coverage (full world) ────────────────────────────────────────────────

class TestRuleCoverage:
    def _by_type(self, challenges, t):
        return [c for c in challenges if c["type"] == t]

    def test_has_navigation(self, challenges_full):
        assert len(self._by_type(challenges_full, "navigation")) >= 1

    def test_has_elevation(self, challenges_full):
        assert len(self._by_type(challenges_full, "elevation")) >= 1

    def test_has_discovery(self, challenges_full):
        assert len(self._by_type(challenges_full, "discovery")) >= 1

    def test_has_route_select(self, challenges_full):
        assert len(self._by_type(challenges_full, "route_select")) >= 1

    def test_has_environmental(self, challenges_full):
        assert len(self._by_type(challenges_full, "environmental")) >= 1

    def test_all_5_types_present(self, challenges_full):
        present = {c["type"] for c in challenges_full}
        assert present == VALID_TYPES

    def test_at_least_6_challenges(self, challenges_full):
        assert len(challenges_full) >= 6


# ── Rule-specific params ──────────────────────────────────────────────────────

class TestRuleParams:
    def test_navigation_has_target_enu(self, challenges_full):
        navs = [c for c in challenges_full if c["type"] == "navigation"]
        for n in navs:
            assert "target_enu" in n["params"]
            assert len(n["params"]["target_enu"]) == 2

    def test_navigation_has_radius(self, challenges_full):
        navs = [c for c in challenges_full if c["type"] == "navigation"]
        for n in navs:
            assert "radius_m" in n["params"]
            assert n["params"]["radius_m"] > 0

    def test_elevation_has_target_elevation(self, challenges_full):
        elevs = [c for c in challenges_full if c["type"] == "elevation"]
        assert any("target_elevation_m" in e["params"] for e in elevs)

    def test_elevation_summit_near_z_max(self, challenges_full):
        elevs = [c for c in challenges_full if c["type"] == "elevation"
                 and "target_elevation_m" in c["params"]]
        for e in elevs:
            assert e["params"]["target_elevation_m"] >= 3400  # near 3500m summit

    def test_discovery_has_poi_id(self, challenges_full):
        discs = [c for c in challenges_full if c["type"] == "discovery"]
        for d in discs:
            assert "poi_id" in d["params"]
            assert "/" in d["params"]["poi_id"]

    def test_route_select_has_start_and_end(self, challenges_full):
        routes = [c for c in challenges_full if c["type"] == "route_select"]
        for r in routes:
            assert "start_enu" in r["params"]
            assert "end_enu" in r["params"]

    def test_route_select_start_ne_end(self, challenges_full):
        routes = [c for c in challenges_full if c["type"] == "route_select"]
        for r in routes:
            assert r["params"]["start_enu"] != r["params"]["end_enu"]

    def test_environmental_cliff_challenge(self, challenges_full):
        envs = [c for c in challenges_full if c["type"] == "environmental"]
        cliff_challenges = [e for e in envs if "forbidden_tiles" in e["params"]]
        assert len(cliff_challenges) >= 1


# ── Determinism ────────────────────────────────────────────────────────────────

class TestDeterminism:
    def test_same_world_same_challenges(self):
        a = generate_challenges(
            WORLD_ID,
            terrain_summary=TERRAIN_SUMMARY_MIXED,
            named_features=NAMED_FEATURES_FULL,
            poi_records=POI_RECORDS_FULL,
            z_min=2700.0, z_max=3500.0,
            east_half=500.0, north_half=500.0,
        )
        b = generate_challenges(
            WORLD_ID,
            terrain_summary=TERRAIN_SUMMARY_MIXED,
            named_features=NAMED_FEATURES_FULL,
            poi_records=POI_RECORDS_FULL,
            z_min=2700.0, z_max=3500.0,
            east_half=500.0, north_half=500.0,
        )
        assert a == b

    def test_different_world_id_different_ids(self):
        a = generate_challenges(
            "aabbccddeeff0011",
            terrain_summary=TERRAIN_SUMMARY_MIXED,
            named_features=NAMED_FEATURES_FULL,
            poi_records=POI_RECORDS_FULL,
            z_min=2700.0, z_max=3500.0,
            east_half=500.0, north_half=500.0,
        )
        b = generate_challenges(
            "1122334455667788",
            terrain_summary=TERRAIN_SUMMARY_MIXED,
            named_features=NAMED_FEATURES_FULL,
            poi_records=POI_RECORDS_FULL,
            z_min=2700.0, z_max=3500.0,
            east_half=500.0, north_half=500.0,
        )
        ids_a = {c["id"] for c in a}
        ids_b = {c["id"] for c in b}
        assert ids_a != ids_b


# ── Flat / empty world (fallback paths) ──────────────────────────────────────

class TestFlatWorld:
    def test_still_returns_challenges(self, challenges_flat):
        assert len(challenges_flat) >= 1

    def test_navigation_fallback_exists(self, challenges_flat):
        navs = [c for c in challenges_flat if c["type"] == "navigation"]
        assert len(navs) >= 1

    def test_no_elevation_challenge_on_flat(self, challenges_flat):
        elevs = [c for c in challenges_flat if c["type"] == "elevation"]
        assert len(elevs) == 0

    def test_no_discovery_without_pois(self, challenges_flat):
        discs = [c for c in challenges_flat if c["type"] == "discovery"]
        assert len(discs) == 0


# ── Output file ───────────────────────────────────────────────────────────────

class TestOutputFile:
    def test_challenges_json_written(self, tmp_path: Path):
        out = tmp_path / "challenges.json"
        generate_challenges(
            WORLD_ID,
            terrain_summary=TERRAIN_SUMMARY_MIXED,
            named_features=NAMED_FEATURES_FULL,
            poi_records=POI_RECORDS_FULL,
            z_min=2700.0, z_max=3500.0,
            east_half=500.0, north_half=500.0,
            output_path=out,
        )
        assert out.exists()

    def test_json_schema(self, tmp_path: Path):
        out = tmp_path / "challenges.json"
        result = generate_challenges(
            WORLD_ID,
            terrain_summary=TERRAIN_SUMMARY_MIXED,
            named_features=NAMED_FEATURES_FULL,
            poi_records=POI_RECORDS_FULL,
            z_min=2700.0, z_max=3500.0,
            east_half=500.0, north_half=500.0,
            output_path=out,
        )
        data = json.loads(out.read_text())
        assert "count" in data
        assert "challenges" in data
        assert data["count"] == len(result)
        assert isinstance(data["challenges"], list)
