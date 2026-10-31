"""
Tests for terrain_analyzer (P5-01).

Uses a synthetic 32×32 heightmap so no network or GeoTIFF is needed.
The heightmap is constructed to have:
  - A flat central plateau (low slope)
  - A steep western slope (high slope)
  - A local summit (north-east corner)
  - A local valley (south-west corner)
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest

from app.gameplay.terrain_analyzer import (
    TerrainFeatures,
    _classify,
    analyze_terrain,
)

# ── Shared synthetic heightmap ─────────────────────────────────────────────────

NROWS, NCOLS = 32, 32

# Cell size: 10 m in each direction.
CELL_E, CELL_N = 10.0, 10.0
EAST_MIN, EAST_MAX   =    0.0, (NCOLS - 1) * CELL_E   #   0 –  310 m
NORTH_MIN, NORTH_MAX = -310.0, 0.0                      # -310 –    0 m

# Elevation: flat plateau at 1000 m, then ramp steeply on the western half.
def _make_elevation() -> np.ndarray:
    elev = np.full((NROWS, NCOLS), 1000.0)
    # Western columns (col < 8): steep ramp rising 5 m per column step.
    for c in range(8):
        elev[:, c] = 1000.0 + (8 - c) * 5.0   # 1040, 1035, …, 1005
    # Summit: at (row=9, col=22) — well inside the min_distance=8 edge guard.
    elev[9, 22] = 1100.0
    # Valley: at (row=22, col=9).
    elev[22, 9] = 900.0
    return elev


def _make_heightmap(tmp_path: Path) -> Path:
    elev = _make_elevation()
    hmap = {
        "nrows":     NROWS,
        "ncols":     NCOLS,
        "heights":   [round(float(v), 2) for v in elev.ravel()],
        "east_min":  EAST_MIN,
        "east_max":  EAST_MAX,
        "north_min": NORTH_MIN,
        "north_max": NORTH_MAX,
        "z_min":     float(elev.min()),
        "z_max":     float(elev.max()),
    }
    p = tmp_path / "heightmap.json"
    p.write_text(json.dumps(hmap))
    return p


@pytest.fixture(scope="module")
def heightmap_path(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return _make_heightmap(tmp_path_factory.mktemp("hmap"))


@pytest.fixture(scope="module")
def features(heightmap_path: Path) -> TerrainFeatures:
    return analyze_terrain(heightmap_path)


# ── _classify unit tests ───────────────────────────────────────────────────────

class TestClassify:
    def test_flat(self):        assert _classify(0.0)  == "flat"
    def test_flat_boundary(self): assert _classify(4.9) == "flat"
    def test_easy(self):        assert _classify(5.0)  == "easy"
    def test_easy_mid(self):    assert _classify(10.0) == "easy"
    def test_moderate(self):    assert _classify(15.0) == "moderate"
    def test_steep(self):       assert _classify(25.0) == "steep"
    def test_cliff(self):       assert _classify(35.0) == "cliff"
    def test_cliff_extreme(self): assert _classify(89.0) == "cliff"


# ── Output file ────────────────────────────────────────────────────────────────

class TestOutput:
    def test_file_written(self, features: TerrainFeatures):
        assert features.output_path.exists()
        assert features.output_path.stat().st_size > 0

    def test_json_parseable(self, features: TerrainFeatures):
        data = json.loads(features.output_path.read_text())
        assert isinstance(data, dict)


# ── Schema ─────────────────────────────────────────────────────────────────────

class TestSchema:
    def test_nrows_ncols(self, features: TerrainFeatures):
        assert features.nrows == NROWS
        assert features.ncols == NCOLS

    def test_cell_sizes_positive(self, features: TerrainFeatures):
        assert features.cell_size_e > 0
        assert features.cell_size_n > 0

    def test_slope_shape(self, features: TerrainFeatures):
        assert features.slope_deg.shape == (NROWS, NCOLS)

    def test_difficulty_shape(self, features: TerrainFeatures):
        assert features.difficulty.shape == (NROWS, NCOLS)

    def test_slope_non_negative(self, features: TerrainFeatures):
        assert (features.slope_deg >= 0).all()

    def test_slope_le_90(self, features: TerrainFeatures):
        assert (features.slope_deg <= 90.0).all()

    def test_difficulty_valid_values(self, features: TerrainFeatures):
        valid = {"flat", "easy", "moderate", "steep", "cliff"}
        unique = set(features.difficulty.ravel().tolist())
        assert unique.issubset(valid)


# ── Slope correctness ──────────────────────────────────────────────────────────

class TestSlope:
    def test_flat_plateau_is_low_slope(self, features: TerrainFeatures):
        # Interior plateau cells (col 12–20, all rows) should be < 5°.
        plateau_slopes = features.slope_deg[:, 12:21]
        assert float(plateau_slopes.max()) < 5.0

    def test_steep_ramp_detected(self, features: TerrainFeatures):
        # The western ramp (col 1–6) rises 5 m per 10 m → slope ≈ 26.6°.
        ramp_slopes = features.slope_deg[8:24, 1:7]
        assert float(ramp_slopes.mean()) > 20.0

    def test_ramp_slope_approx(self, features: TerrainFeatures):
        # Expected: arctan(5/10) ≈ 26.6°
        expected = math.degrees(math.atan(5.0 / 10.0))
        interior_ramp = features.slope_deg[8:24, 2:6]
        assert abs(float(interior_ramp.mean()) - expected) < 3.0  # within 3°


# ── Difficulty classification ──────────────────────────────────────────────────

class TestDifficulty:
    def test_plateau_is_flat_or_easy(self, features: TerrainFeatures):
        plateau = features.difficulty[8:24, 12:21]
        for cell in plateau.ravel():
            assert cell in ("flat", "easy")

    def test_ramp_is_steep_or_cliff(self, features: TerrainFeatures):
        ramp = features.difficulty[8:24, 2:6]
        steep_plus = sum(1 for c in ramp.ravel() if c in ("steep", "cliff", "moderate"))
        assert steep_plus > ramp.size * 0.5

    def test_summary_percentages_sum_to_100(self, features: TerrainFeatures):
        s = features.summary
        total = (s["flat_pct"] + s["easy_pct"] + s["moderate_pct"]
                 + s["steep_pct"] + s["cliff_pct"])
        assert abs(total - 100.0) < 0.2   # allow rounding error


# ── Summary ────────────────────────────────────────────────────────────────────

class TestSummary:
    def test_mean_slope_positive(self, features: TerrainFeatures):
        assert features.summary["mean_slope_deg"] > 0

    def test_max_slope_ge_mean(self, features: TerrainFeatures):
        assert features.summary["max_slope_deg"] >= features.summary["mean_slope_deg"]

    def test_all_summary_keys_present(self, features: TerrainFeatures):
        expected = {
            "flat_pct", "easy_pct", "moderate_pct", "steep_pct", "cliff_pct",
            "mean_slope_deg", "max_slope_deg",
        }
        assert expected.issubset(features.summary.keys())


# ── Notable features ───────────────────────────────────────────────────────────

class TestFeatures:
    def test_features_is_list(self, features: TerrainFeatures):
        assert isinstance(features.features, list)

    def test_has_summit(self, features: TerrainFeatures):
        types = [f["type"] for f in features.features]
        assert "summit" in types

    def test_summit_fields(self, features: TerrainFeatures):
        summits = [f for f in features.features if f["type"] == "summit"]
        for s in summits:
            assert "enu" in s
            assert len(s["enu"]) == 2
            assert "elevation_m" in s
            assert "slope_deg" in s

    def test_has_valley(self, features: TerrainFeatures):
        types = [f["type"] for f in features.features]
        assert "valley" in types

    def test_valley_fields(self, features: TerrainFeatures):
        valleys = [f for f in features.features if f["type"] == "valley"]
        for v in valleys:
            assert "enu" in v
            assert "elevation_m" in v

    def test_summit_elevation_is_high(self, features: TerrainFeatures):
        summits = [f for f in features.features if f["type"] == "summit"]
        assert any(s["elevation_m"] >= 1050.0 for s in summits)

    def test_valley_elevation_is_low(self, features: TerrainFeatures):
        valleys = [f for f in features.features if f["type"] == "valley"]
        assert any(v["elevation_m"] <= 950.0 for v in valleys)

    def test_cliff_zone_if_present_has_required_fields(self, features: TerrainFeatures):
        cliffs = [f for f in features.features if f["type"] == "cliff_zone"]
        for c in cliffs:
            assert "centroid_enu" in c
            assert "cell_count" in c
            assert c["cell_count"] >= 1
            assert "mean_slope_deg" in c

    def test_no_more_than_3_summits(self, features: TerrainFeatures):
        summits = [f for f in features.features if f["type"] == "summit"]
        assert len(summits) <= 3

    def test_no_more_than_3_valleys(self, features: TerrainFeatures):
        valleys = [f for f in features.features if f["type"] == "valley"]
        assert len(valleys) <= 3


# ── JSON output schema ─────────────────────────────────────────────────────────

class TestJSONOutput:
    def test_json_slope_length(self, features: TerrainFeatures):
        data = json.loads(features.output_path.read_text())
        assert len(data["slope_deg"]) == NROWS * NCOLS

    def test_json_difficulty_length(self, features: TerrainFeatures):
        data = json.loads(features.output_path.read_text())
        assert len(data["difficulty"]) == NROWS * NCOLS

    def test_json_features_array(self, features: TerrainFeatures):
        data = json.loads(features.output_path.read_text())
        assert isinstance(data["features"], list)

    def test_json_has_summary(self, features: TerrainFeatures):
        data = json.loads(features.output_path.read_text())
        assert "summary" in data
        assert "mean_slope_deg" in data["summary"]
