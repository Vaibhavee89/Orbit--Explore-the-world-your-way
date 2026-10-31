"""
Integration tests for elevation_fetcher.

Makes real HTTP tile downloads on first run; subsequent runs are instant
because tiles and the cropped GeoTIFF are cached to .elevation_cache/.

Manali bbox (~500 m square, same as P2-03):
  west=77.183, south=32.239, east=77.195, north=32.248
Expected elevation range: ~2 000 – 4 500 m (Himalayan foothills).
"""

import json
import math

import numpy as np
import pytest
import rasterio

from app.world_builder.elevation_fetcher import (
    ElevationData,
    _bbox_hash,
    _CACHE_DIR,
    _deg2tile,
    _tile_bounds,
    fetch_elevation,
)

WEST, SOUTH, EAST, NORTH = 77.183, 32.239, 77.195, 32.248


@pytest.fixture(scope="module")
def elev() -> ElevationData:
    """Fetch once; all tests in this module share the GeoTIFF."""
    return fetch_elevation(WEST, SOUTH, EAST, NORTH)


# ── Tile helper tests (no network) ───────────────────────────────────────────

class TestTileHelpers:

    def test_deg2tile_manali(self):
        x, y = _deg2tile(32.244, 77.189, 14)
        # Sanity-check: x in the Asia longitude band
        assert 10_000 < x < 12_000
        assert 0 < y < 10_000

    def test_tile_bounds_round_trip(self):
        """A point inside a tile's bounds should map back to that tile."""
        zoom = 14
        lat, lon = 32.244, 77.189
        x, y = _deg2tile(lat, lon, zoom)
        west, south, east, north = _tile_bounds(x, y, zoom)
        assert west <= lon <= east
        assert south <= lat <= north

    def test_tile_bounds_non_degenerate(self):
        west, south, east, north = _tile_bounds(11580, 3148, 14)
        assert east > west
        assert north > south


# ── GeoTIFF existence and shape ───────────────────────────────────────────────

class TestFetch:

    def test_tif_exists(self, elev: ElevationData):
        assert elev.tif_path.exists(), "Cropped GeoTIFF should be written to cache"

    def test_rasterio_opens(self, elev: ElevationData):
        with elev.open() as src:
            assert src.count >= 1

    def test_shape_positive(self, elev: ElevationData):
        with elev.open() as src:
            assert src.height > 0
            assert src.width > 0

    def test_at_least_10_rows_and_cols(self, elev: ElevationData):
        """500 m bbox at ~9.5 m/px should yield ≥ 10 pixels in each dimension."""
        with elev.open() as src:
            assert src.height >= 10
            assert src.width >= 10

    def test_crs_is_wgs84(self, elev: ElevationData):
        with elev.open() as src:
            assert src.crs is not None
            assert src.crs.to_epsg() == 4326

    def test_bbox_covered(self, elev: ElevationData):
        """Raster bounds should enclose (or closely match) the requested bbox."""
        with elev.open() as src:
            b = src.bounds
            # Allow up to one pixel of slop on each side
            px = max(abs(src.res[0]), abs(src.res[1]))
            assert b.left   <= WEST  + px
            assert b.bottom <= SOUTH + px
            assert b.right  >= EAST  - px
            assert b.top    >= NORTH - px

    def test_single_band(self, elev: ElevationData):
        with elev.open() as src:
            assert src.count == 1, "Elevation raster should have exactly 1 band"

    def test_dtype_numeric(self, elev: ElevationData):
        with elev.open() as src:
            assert np.issubdtype(src.dtypes[0], np.number)


# ── Elevation values ──────────────────────────────────────────────────────────

class TestElevationValues:

    def test_elevation_range_plausible(self, elev: ElevationData):
        """Manali area: ~2 000 m – 4 500 m (Beas valley to ridgeline)."""
        s = elev.stats
        assert s["min_m"] is not None
        assert 1_000 < s["min_m"] < 5_000, f"min {s['min_m']:.0f} m out of range"
        assert 1_000 < s["max_m"] < 6_000, f"max {s['max_m']:.0f} m out of range"

    def test_relief_present(self, elev: ElevationData):
        """There should be meaningful topographic relief (> 50 m) in the bbox."""
        s = elev.stats
        assert s["max_m"] - s["min_m"] > 50, "Expected > 50 m of relief in Manali bbox"

    def test_no_all_nodata(self, elev: ElevationData):
        with elev.open() as src:
            band = src.read(1, masked=True)
            assert not band.mask.all(), "All pixels are nodata — fetch likely failed"

    def test_stats_in_result(self, elev: ElevationData):
        for key in ("min_m", "max_m", "mean_m", "shape"):
            assert key in elev.stats, f"Missing stat key: {key}"


# ── Cache behaviour ───────────────────────────────────────────────────────────

class TestCache:

    def test_cache_file_written(self, elev: ElevationData):
        h = _bbox_hash(WEST, SOUTH, EAST, NORTH)
        assert (_CACHE_DIR / f"{h}_elevation.tif").exists()
        assert (_CACHE_DIR / f"{h}_meta.json").exists()

    def test_second_call_is_cached(self):
        elev2 = fetch_elevation(WEST, SOUTH, EAST, NORTH)
        assert elev2.from_cache is True

    def test_cache_meta_contains_stats(self):
        h = _bbox_hash(WEST, SOUTH, EAST, NORTH)
        meta = json.loads((_CACHE_DIR / f"{h}_meta.json").read_text())
        assert "fetched_at" in meta
        assert meta["stats"]["min_m"] is not None

    def test_force_refresh_bypasses_cache(self):
        elev3 = fetch_elevation(WEST, SOUTH, EAST, NORTH, force_refresh=True)
        assert elev3.from_cache is False
