"""
Elevation fetcher for Adventure Mode world generation.

Source: AWS Terrain Tiles (Mapzen) — public S3 bucket, no auth required.
URL:    https://s3.amazonaws.com/elevation-tiles-prod/geotiff/{z}/{x}/{y}.tif
CRS:    Tiles are in EPSG:4326 (geographic WGS-84).
Resolution: zoom 14 → ~9.5 m/px at latitude 32°.

Swap _TILE_URL and _ZOOM to use a different DEM (e.g. Copernicus GLO-30 via
presigned S3 URLs when AWS credentials are available).

Cache layout:
  .elevation_cache/tile_{z}_{x}_{y}.tif       raw downloaded tiles
  .elevation_cache/<hex16>_elevation.tif       cropped bbox raster
  .elevation_cache/<hex16>_meta.json           stats + provenance
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
import rasterio.warp
from rasterio.merge import merge
from rasterio.mask import mask as rasterio_mask
from shapely.geometry import box as shapely_box

# ── Configuration ─────────────────────────────────────────────────────────────

_CACHE_DIR = Path(
    os.getenv("ELEVATION_CACHE_DIR",
              str(Path(__file__).parent.parent.parent / ".elevation_cache"))
)
_ZOOM = 14  # ~2.4 km tiles, ~9.5 m/px at lat 32°
_TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/geotiff/{z}/{x}/{y}.tif"
_REQUEST_TIMEOUT = 30  # seconds


# ── Tile coordinate helpers ───────────────────────────────────────────────────

def _deg2tile(lat_deg: float, lon_deg: float, zoom: int) -> tuple[int, int]:
    """Slippy-map tile indices (x, y) for a geographic point."""
    n = 2 ** zoom
    x = int((lon_deg + 180) / 360 * n)
    lat_r = math.radians(lat_deg)
    y = int((1 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2 * n)
    return x, y


def _tile_bounds(x: int, y: int, zoom: int) -> tuple[float, float, float, float]:
    """Return (west, south, east, north) in WGS-84 for a slippy-map tile."""
    n = 2 ** zoom

    def _x2lon(xi: int) -> float:
        return xi / n * 360 - 180

    def _y2lat(yi: int) -> float:
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yi / n))))

    return _x2lon(x), _y2lat(y + 1), _x2lon(x + 1), _y2lat(y)


# ── Cache helpers ─────────────────────────────────────────────────────────────

def _bbox_hash(west: float, south: float, east: float, north: float) -> str:
    key = f"{west:.6f},{south:.6f},{east:.6f},{north:.6f}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _result_paths(h: str) -> dict[str, Path]:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return {
        "tif":  _CACHE_DIR / f"{h}_elevation.tif",
        "meta": _CACHE_DIR / f"{h}_meta.json",
    }


def _cache_valid(paths: dict[str, Path]) -> bool:
    return paths["tif"].exists() and paths["meta"].exists()


# ── Tile download ─────────────────────────────────────────────────────────────

def _download_tile(z: int, x: int, y: int) -> Path:
    tile_path = _CACHE_DIR / f"tile_{z}_{x}_{y}.tif"
    if tile_path.exists():
        return tile_path
    url = _TILE_URL.format(z=z, x=x, y=y)
    req = urllib.request.Request(url, headers={"User-Agent": "orbit-worldbuilder/1.0"})
    with urllib.request.urlopen(req, timeout=_REQUEST_TIMEOUT) as resp:
        tile_path.write_bytes(resp.read())
    return tile_path


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class ElevationData:
    """Cropped DEM raster for a bounding box."""

    tif_path: Path
    bbox: tuple[float, float, float, float]  # (west, south, east, north)
    from_cache: bool = False
    stats: dict[str, Any] = field(default_factory=dict)

    def open(self) -> rasterio.DatasetReader:
        """Return an open rasterio dataset (caller must close/context-manage)."""
        return rasterio.open(self.tif_path)


# ── Main entry point ──────────────────────────────────────────────────────────

def fetch_elevation(
    west: float,
    south: float,
    east: float,
    north: float,
    *,
    force_refresh: bool = False,
    zoom: int = _ZOOM,
) -> ElevationData:
    """
    Fetch a DEM raster covering (west, south, east, north) in WGS-84.

    Downloads the minimum set of Slippy-map tiles at *zoom*, merges them,
    crops to the exact bbox, and saves a GeoTIFF to the elevation cache.

    Parameters
    ----------
    west, south, east, north : float
        Bounding box in WGS-84 decimal degrees.
    force_refresh : bool
        Re-download even when a cached GeoTIFF exists.
    zoom : int
        Slippy-map zoom level (default 14 → ~9.5 m/px at lat 32°).

    Returns
    -------
    ElevationData
        Dataclass with `.tif_path` (Path) and `.open()` helper.
    """
    h = _bbox_hash(west, south, east, north)
    paths = _result_paths(h)
    bbox = (west, south, east, north)

    if not force_refresh and _cache_valid(paths):
        meta = json.loads(paths["meta"].read_text())
        return ElevationData(
            tif_path=paths["tif"], bbox=bbox,
            from_cache=True, stats=meta.get("stats", {}),
        )

    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    t0 = time.time()

    # ── Determine which tiles cover the bbox ──────────────────────────────────
    # y increases southward in slippy-map, so north → smaller y, south → larger y
    x_min, y_min = _deg2tile(north, west, zoom)
    x_max, y_max = _deg2tile(south, east, zoom)

    tile_paths: list[Path] = []
    for tx in range(x_min, x_max + 1):
        for ty in range(y_min, y_max + 1):
            tile_paths.append(_download_tile(zoom, tx, ty))

    # ── Merge tiles ───────────────────────────────────────────────────────────
    # Use an explicit nodata sentinel to avoid float32 representation warnings.
    _NODATA = -9999.0
    datasets = [rasterio.open(p) for p in tile_paths]
    try:
        merged_data, merged_transform = merge(datasets, nodata=_NODATA)
        merged_meta = datasets[0].meta.copy()
        merged_meta.update({
            "height":    merged_data.shape[1],
            "width":     merged_data.shape[2],
            "transform": merged_transform,
            "nodata":    _NODATA,
        })
        src_crs = datasets[0].crs
    finally:
        for ds in datasets:
            ds.close()

    tmp_merge = paths["tif"].with_suffix(".merge.tmp.tif")
    tmp_crop  = paths["tif"].with_suffix(".crop.tmp.tif")
    try:
        # ── Write merged tiles to disk ────────────────────────────────────────
        with rasterio.open(tmp_merge, "w", **merged_meta) as tmp:
            tmp.write(merged_data)

        # ── Crop to bbox (geometry must match raster CRS) ─────────────────────
        with rasterio.open(tmp_merge) as src:
            crop_geom_4326 = shapely_box(west, south, east, north)
            if src.crs and src.crs.to_epsg() != 4326:
                crop_geom = _reproject_geom(crop_geom_4326, 4326, src.crs.to_epsg())
            else:
                crop_geom = crop_geom_4326
            cropped, cropped_transform = rasterio_mask(
                src, [crop_geom.__geo_interface__], crop=True, all_touched=True,
            )
            cropped_meta = src.meta.copy()
            cropped_meta.update({
                "height":    cropped.shape[1],
                "width":     cropped.shape[2],
                "transform": cropped_transform,
                "compress":  "deflate",
            })
            with rasterio.open(tmp_crop, "w", **cropped_meta) as dst:
                dst.write(cropped)

        # ── Reproject cropped raster to EPSG:4326 (file-based) ────────────────
        with rasterio.open(tmp_crop) as src:
            if src.crs and src.crs.to_epsg() != 4326:
                dst_crs = rasterio.crs.CRS.from_epsg(4326)
                xform_4326, w_4326, h_4326 = rasterio.warp.calculate_default_transform(
                    src.crs, dst_crs, src.width, src.height, *src.bounds,
                )
                out_meta = src.meta.copy()
                out_meta.update({
                    "crs": dst_crs, "transform": xform_4326,
                    "width": w_4326, "height": h_4326,
                })
                with rasterio.open(paths["tif"], "w", **out_meta) as dst:
                    for band_idx in range(1, src.count + 1):
                        rasterio.warp.reproject(
                            source=rasterio.band(src, band_idx),
                            destination=rasterio.band(dst, band_idx),
                            src_transform=src.transform,
                            src_crs=src.crs,
                            dst_transform=xform_4326,
                            dst_crs=dst_crs,
                            resampling=rasterio.warp.Resampling.bilinear,
                        )
            else:
                # Already 4326 — copy directly
                import shutil
                shutil.copy2(tmp_crop, paths["tif"])
    finally:
        tmp_merge.unlink(missing_ok=True)
        tmp_crop.unlink(missing_ok=True)

    # ── Stats ─────────────────────────────────────────────────────────────────
    with rasterio.open(paths["tif"]) as dst:
        band = dst.read(1, masked=True)
        valid = band.compressed()
        stats: dict[str, Any] = {
            "min_m":   float(valid.min()) if valid.size else None,
            "max_m":   float(valid.max()) if valid.size else None,
            "mean_m":  float(valid.mean()) if valid.size else None,
            "shape":   list(band.shape),
            "crs":     str(dst.crs),
            "elapsed_s": round(time.time() - t0, 2),
            "zoom":    zoom,
            "tiles":   len(tile_paths),
        }

    paths["meta"].write_text(json.dumps({
        "fetched_at": time.time(),
        "stats": stats,
    }))

    return ElevationData(tif_path=paths["tif"], bbox=bbox, from_cache=False, stats=stats)


# ── CRS helpers ───────────────────────────────────────────────────────────────

def _reproject_geom(geom, src_epsg: int, dst_epsg: int):
    """Reproject a Shapely geometry between two EPSG codes."""
    import shapely
    from pyproj import Transformer
    t = Transformer.from_crs(src_epsg, dst_epsg, always_xy=True)
    # shapely.transform passes an (N,2) coords array; pyproj expects (xx, yy).
    return shapely.transform(geom, lambda c: np.column_stack(t.transform(c[:, 0], c[:, 1])))


def _reproject_array_to_4326(
    data: np.ndarray,
    meta: dict,
    src_crs: rasterio.crs.CRS,
) -> tuple[np.ndarray, dict]:
    """Reproject a rasterio array to EPSG:4326, returning (array, updated_meta)."""
    dst_crs = rasterio.crs.CRS.from_epsg(4326)
    transform_4326, width, height = rasterio.warp.calculate_default_transform(
        src_crs, dst_crs, meta["width"], meta["height"],
        left=meta["transform"].c,
        top=meta["transform"].f,
        right=meta["transform"].c + meta["transform"].a * meta["width"],
        bottom=meta["transform"].f + meta["transform"].e * meta["height"],
    )
    out = np.zeros((data.shape[0], height, width), dtype=data.dtype)
    rasterio.warp.reproject(
        source=data,
        destination=out,
        src_transform=meta["transform"],
        src_crs=src_crs,
        dst_transform=transform_4326,
        dst_crs=dst_crs,
        resampling=rasterio.warp.Resampling.bilinear,
    )
    new_meta = meta.copy()
    new_meta.update({"crs": dst_crs, "transform": transform_4326, "width": width, "height": height})
    return out, new_meta
