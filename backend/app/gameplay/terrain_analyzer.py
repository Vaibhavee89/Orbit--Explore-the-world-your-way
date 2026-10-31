"""
Terrain feature extractor for Adventure Mode gameplay (P5-01).

Reads the heightmap.json side-channel produced by terrain_processor and
derives per-tile slope and difficulty, then detects notable terrain features
(summits, valleys, cliff zones).

Output — terrain_features.json written next to the heightmap:
{
  "nrows": int,
  "ncols": int,
  "cell_size_e": float,          # metres per column step (East direction)
  "cell_size_n": float,          # metres per row step    (North direction)
  "slope_deg":   [float, ...],   # row-major, one value per tile
  "difficulty":  [str,   ...],   # row-major: "flat"|"easy"|"moderate"|"steep"|"cliff"
  "summary": {
    "flat_pct":      float,      # % of tiles in each class
    "easy_pct":      float,
    "moderate_pct":  float,
    "steep_pct":     float,
    "cliff_pct":     float,
    "mean_slope_deg": float,
    "max_slope_deg":  float,
  },
  "features": [                  # notable terrain points / zones
    {"type": "summit",     "enu": [e, n], "elevation_m": float, "slope_deg": float},
    {"type": "valley",     "enu": [e, n], "elevation_m": float},
    {"type": "cliff_zone", "centroid_enu": [e, n], "cell_count": int, "mean_slope_deg": float},
  ]
}

The WorldManifest consumer reads this as:
  manifest.assets["terrain_features"] = "terrain_features.json"
  manifest.stats["features"]          = summary dict
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from scipy import ndimage

# ── Difficulty thresholds (degrees) ──────────────────────────────────────────

_THRESHOLDS = [
    (5.0,  "flat"),
    (15.0, "easy"),
    (25.0, "moderate"),
    (35.0, "steep"),
]
# ≥ 35° → "cliff"

# Minimum contiguous cells for a cliff zone to be reported as a feature.
_CLIFF_MIN_CELLS = 4


def _classify(slope_deg: float) -> str:
    for threshold, label in _THRESHOLDS:
        if slope_deg < threshold:
            return label
    return "cliff"


# ── Feature detection helpers ─────────────────────────────────────────────────

def _local_maxima_indices(arr: np.ndarray, min_distance: int = 8) -> list[tuple[int, int]]:
    """
    Return (row, col) indices of local maxima in a 2-D array.
    A cell is a local maximum if it is strictly greater than all 8-connected
    neighbours within a (2*min_distance+1) neighbourhood.
    """
    footprint = np.ones((min_distance * 2 + 1, min_distance * 2 + 1), dtype=bool)
    local_max = ndimage.maximum_filter(arr, footprint=footprint) == arr
    # Exclude edge pixels.
    local_max[:min_distance, :]  = False
    local_max[-min_distance:, :] = False
    local_max[:, :min_distance]  = False
    local_max[:, -min_distance:] = False
    rows, cols = np.where(local_max)
    return list(zip(rows.tolist(), cols.tolist()))


def _local_minima_indices(arr: np.ndarray, min_distance: int = 8) -> list[tuple[int, int]]:
    return _local_maxima_indices(-arr, min_distance)


def _cell_enu(row: int, col: int,
              east_min: float, north_max: float,
              cell_size_e: float, cell_size_n: float) -> list[float]:
    """Convert (row, col) grid index to ENU [east, north] metres."""
    e = east_min  + col * cell_size_e
    n = north_max - row * cell_size_n   # row=0 → northern edge
    return [round(e, 1), round(n, 1)]


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class TerrainFeatures:
    output_path: Path
    nrows: int
    ncols: int
    cell_size_e: float
    cell_size_n: float
    slope_deg: np.ndarray       # shape (nrows, ncols)
    difficulty: np.ndarray      # shape (nrows, ncols), dtype object (str)
    summary: dict[str, Any] = field(default_factory=dict)
    features: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "nrows":       self.nrows,
            "ncols":       self.ncols,
            "cell_size_e": round(self.cell_size_e, 3),
            "cell_size_n": round(self.cell_size_n, 3),
            "slope_deg":   [round(float(v), 2) for v in self.slope_deg.ravel()],
            "difficulty":  self.difficulty.ravel().tolist(),
            "summary":     self.summary,
            "features":    self.features,
        }

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(self.to_dict()))


# ── Main entry point ──────────────────────────────────────────────────────────

def analyze_terrain(
    heightmap_path: Path | str,
    *,
    output_path: Path | str | None = None,
    summit_min_distance: int = 8,
    cliff_min_cells: int = _CLIFF_MIN_CELLS,
) -> TerrainFeatures:
    """
    Derive slope, difficulty, and notable features from a heightmap.

    Parameters
    ----------
    heightmap_path : Path | str
        Path to the ``heightmap.json`` produced by terrain_processor.
    output_path : Path | str | None
        Where to write ``terrain_features.json``.  Defaults to
        ``heightmap_path.parent / "terrain_features.json"``.
    summit_min_distance : int
        Minimum cell separation between detected summits / valleys.
    cliff_min_cells : int
        Minimum contiguous cliff cells to report a cliff zone feature.

    Returns
    -------
    TerrainFeatures
        Dataclass with arrays and the list of named features.
    """
    heightmap_path = Path(heightmap_path)
    if output_path is None:
        output_path = heightmap_path.parent / "terrain_features.json"
    output_path = Path(output_path)

    # ── 1. Load heightmap ─────────────────────────────────────────────────────
    hmap = json.loads(heightmap_path.read_text())
    nrows:    int   = hmap["nrows"]
    ncols:    int   = hmap["ncols"]
    east_min: float = hmap["east_min"]
    east_max: float = hmap["east_max"]
    north_min: float = hmap["north_min"]
    north_max: float = hmap["north_max"]

    elevation = np.array(hmap["heights"], dtype=np.float64).reshape(nrows, ncols)

    # Cell size in metres.
    # Heightmap rows go north→south (row 0 = north edge), cols go west→east.
    cell_size_e = (east_max - east_min)   / max(ncols - 1, 1)
    cell_size_n = (north_max - north_min) / max(nrows - 1, 1)

    # ── 2. Slope from gradient ────────────────────────────────────────────────
    # np.gradient returns (d/drow, d/dcol) = (−dz/dn, dz/de) given cell sizes.
    dz_drow, dz_dcol = np.gradient(elevation, cell_size_n, cell_size_e)

    # dz/dn = −dz_drow (north increases as row decreases).
    # slope magnitude = sqrt( (dz/de)² + (dz/dn)² )
    slope_magnitude = np.sqrt(dz_dcol ** 2 + dz_drow ** 2)
    slope_deg = np.degrees(np.arctan(slope_magnitude))

    # ── 3. Per-tile difficulty ────────────────────────────────────────────────
    difficulty = np.vectorize(_classify)(slope_deg)

    # ── 4. Summary statistics ─────────────────────────────────────────────────
    total = nrows * ncols
    classes = ["flat", "easy", "moderate", "steep", "cliff"]

    def _pct(label: str) -> float:
        return round(float(np.sum(difficulty == label)) / total * 100, 1)

    summary: dict[str, Any] = {
        "flat_pct":       _pct("flat"),
        "easy_pct":       _pct("easy"),
        "moderate_pct":   _pct("moderate"),
        "steep_pct":      _pct("steep"),
        "cliff_pct":      _pct("cliff"),
        "mean_slope_deg": round(float(slope_deg.mean()), 2),
        "max_slope_deg":  round(float(slope_deg.max()),  2),
    }

    # ── 5. Notable features ───────────────────────────────────────────────────
    features: list[dict[str, Any]] = []

    # 5a. Summits — up to 3 most prominent local maxima.
    summit_indices = _local_maxima_indices(elevation, summit_min_distance)
    summit_indices.sort(key=lambda rc: elevation[rc[0], rc[1]], reverse=True)
    for row, col in summit_indices[:3]:
        enu = _cell_enu(row, col, east_min, north_max, cell_size_e, cell_size_n)
        features.append({
            "type":        "summit",
            "enu":         enu,
            "elevation_m": round(float(elevation[row, col]), 1),
            "slope_deg":   round(float(slope_deg[row, col]),  1),
        })

    # 5b. Valleys — up to 3 most prominent local minima.
    valley_indices = _local_minima_indices(elevation, summit_min_distance)
    valley_indices.sort(key=lambda rc: elevation[rc[0], rc[1]])
    for row, col in valley_indices[:3]:
        enu = _cell_enu(row, col, east_min, north_max, cell_size_e, cell_size_n)
        features.append({
            "type":        "valley",
            "enu":         enu,
            "elevation_m": round(float(elevation[row, col]), 1),
        })

    # 5c. Cliff zones — connected components of cliff-class tiles.
    cliff_mask = (difficulty == "cliff").astype(np.uint8)
    if cliff_mask.any():
        labeled, n_labels = ndimage.label(cliff_mask)
        for label_id in range(1, n_labels + 1):
            component = labeled == label_id
            cell_count = int(component.sum())
            if cell_count < cliff_min_cells:
                continue
            rows_c, cols_c = np.where(component)
            centroid_row = float(rows_c.mean())
            centroid_col = float(cols_c.mean())
            enu = _cell_enu(
                round(centroid_row), round(centroid_col),
                east_min, north_max, cell_size_e, cell_size_n,
            )
            mean_s = float(slope_deg[component].mean())
            features.append({
                "type":          "cliff_zone",
                "centroid_enu":  enu,
                "cell_count":    cell_count,
                "mean_slope_deg": round(mean_s, 1),
            })

    result = TerrainFeatures(
        output_path=output_path,
        nrows=nrows,
        ncols=ncols,
        cell_size_e=cell_size_e,
        cell_size_n=cell_size_n,
        slope_deg=slope_deg,
        difficulty=difficulty,
        summary=summary,
        features=features,
    )
    result.save(output_path)
    return result
