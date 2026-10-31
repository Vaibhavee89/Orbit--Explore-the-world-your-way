"""
Terrain mesh generator for Adventure Mode world generation.

Pipeline:
  1. Open GeoTIFF (EPSG:4326) from elevation_fetcher
  2. Resample to target grid (default 128×128)
  3. Convert pixel centres → ENU metres anchored at bbox centroid (P2-02)
  4. Build vertices (East, North, Up) and quad-triangles for a regular grid
  5. Export as GLB via trimesh

Coordinate system:
  X = East (metres)   Y = North (metres)   Z = elevation (metres)
  Origin = bbox centroid on the WGS-84 ellipsoid surface (alt=0).
  Z values are raw metres-above-sea-level; subtract the mean if you want
  Z=0 at the valley floor.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import json
import numpy as np
import rasterio
import trimesh
from rasterio.enums import Resampling

from app.world_builder.coordinate_system import ENUFrame

# ── WGS-84 constants (matches coordinate_system.py) ──────────────────────────
_A  = 6_378_137.0
_F  = 1 / 298.257_223_563
_B  = _A * (1 - _F)
_E2 = 1 - (_B / _A) ** 2


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class TerrainMesh:
    """Generated terrain mesh and its provenance."""

    glb_path: Path
    vertex_count: int
    face_count: int
    grid_shape: tuple[int, int]           # (rows, cols)
    z_min: float                           # metres (raw elevation)
    z_max: float
    z_mean: float
    origin: tuple[float, float, float]    # (lat, lon, alt) of ENU origin
    heightmap_path: Path | None = None    # path to heightmap.json side-channel
    stats: dict[str, Any] = field(default_factory=dict)


# ── Core helpers ──────────────────────────────────────────────────────────────

def _latlon_to_en_vectorized(
    lat_deg: np.ndarray,
    lon_deg: np.ndarray,
    frame: ENUFrame,
) -> tuple[np.ndarray, np.ndarray]:
    """Batch-convert lat/lon arrays to ENU (E, N) using frame's rotation."""
    lat_r = np.radians(lat_deg)
    lon_r = np.radians(lon_deg)
    N = _A / np.sqrt(1 - _E2 * np.sin(lat_r) ** 2)
    px = N * np.cos(lat_r) * np.cos(lon_r)
    py = N * np.cos(lat_r) * np.sin(lon_r)
    pz = N * (1 - _E2) * np.sin(lat_r)
    dx, dy, dz = px - frame._ox, py - frame._oy, pz - frame._oz
    er, nr = frame._e_row, frame._n_row
    east  = er[0] * dx + er[1] * dy + er[2] * dz
    north = nr[0] * dx + nr[1] * dy + nr[2] * dz
    return east, north


def _grid_faces(rows: int, cols: int) -> np.ndarray:
    """Triangle face indices for a rows×cols vertex grid (two triangles per quad)."""
    r = np.arange(rows - 1)
    c = np.arange(cols - 1)
    r_idx, c_idx = np.meshgrid(r, c, indexing="ij")
    tl = (r_idx * cols + c_idx).ravel()
    tr = tl + 1
    bl = tl + cols
    br = bl + 1
    # Wind counter-clockwise (top-left, bottom-left, top-right)
    tri_a = np.column_stack([tl, bl, tr])
    tri_b = np.column_stack([tr, bl, br])
    return np.vstack([tri_a, tri_b]).astype(np.int32)


# ── Main entry point ──────────────────────────────────────────────────────────

def generate_terrain_mesh(
    tif_path: Path | str,
    *,
    grid_size: int = 128,
    output_path: Path | str | None = None,
    heightmap_path: Path | str | None = None,
) -> TerrainMesh:
    """
    Convert a GeoTIFF elevation raster to a GLB terrain mesh.

    Parameters
    ----------
    tif_path : Path | str
        Input GeoTIFF (EPSG:4326) from :func:`fetch_elevation`.
    grid_size : int
        Number of vertices per side (default 128 → 128×128 = 16 384 vertices,
        32 258 triangles).
    output_path : Path | str | None
        GLB output file.  Defaults to *tif_path* with ``.glb`` extension.

    Returns
    -------
    TerrainMesh
        Provenance dataclass with :attr:`glb_path` pointing at the written file.
    """
    tif_path = Path(tif_path)
    if output_path is None:
        output_path = tif_path.with_suffix(".glb")
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # ── 1. Read & resample raster ─────────────────────────────────────────────
    with rasterio.open(tif_path) as src:
        # Single-band read: out_shape must be (rows, cols) not (1, rows, cols)
        elevation = src.read(
            1,
            out_shape=(grid_size, grid_size),
            resampling=Resampling.bilinear,
        ).astype(np.float64)
        bounds = src.bounds     # (left, bottom, right, top) in WGS-84 degrees
        src_nodata = src.nodata

    # Fill nodata pixels with the mean of valid pixels
    if src_nodata is not None:
        nodata_mask = np.isclose(elevation, src_nodata, rtol=0, atol=1.0)
        valid = elevation[~nodata_mask]
        if valid.size:
            elevation[nodata_mask] = valid.mean()

    # ── 2. Build lat/lon grids for pixel centres ──────────────────────────────
    # Pixel centres are evenly spaced between the raster bounds.
    lons = np.linspace(bounds.left,  bounds.right, grid_size + 1)[:-1]
    lats = np.linspace(bounds.top,   bounds.bottom, grid_size + 1)[:-1]
    lons += (lons[1] - lons[0]) / 2  # shift to centre
    lats += (lats[1] - lats[0]) / 2

    lon_grid, lat_grid = np.meshgrid(lons, lats)   # shape (rows, cols)

    # ── 3. ENU frame at bbox centroid ─────────────────────────────────────────
    origin_lat = (bounds.bottom + bounds.top)  / 2
    origin_lon = (bounds.left   + bounds.right) / 2
    frame = ENUFrame(origin_lat, origin_lon)

    east, north = _latlon_to_en_vectorized(lat_grid, lon_grid, frame)

    # ── 4. Vertices & faces ───────────────────────────────────────────────────
    vertices = np.column_stack([
        east.ravel().astype(np.float32),
        north.ravel().astype(np.float32),
        elevation.ravel().astype(np.float32),
    ])
    faces = _grid_faces(grid_size, grid_size)

    # ── 5. Build & export GLB ─────────────────────────────────────────────────
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    # Compute vertex normals for correct lighting in the viewer
    mesh.vertex_normals  # triggers computation

    mesh.export(str(output_path))

    z_vals = elevation.ravel()

    # ── 6. Heightmap side-channel ─────────────────────────────────────────────
    # Saved as JSON with row-major heights and ENU extents so the frontend can
    # build a Rapier heightfield collider that matches the rendered mesh exactly.
    hmap_path: Path | None = None
    if heightmap_path is not None:
        hmap_path = Path(heightmap_path)
        hmap_data = {
            "nrows":       grid_size,
            "ncols":       grid_size,
            # Row-major (C order): heights[r * ncols + c] = elev at (row=r, col=c).
            # The frontend must transpose to column-major before passing to Rapier.
            "heights":     [round(float(v), 2) for v in elevation.ravel()],
            "east_min":    round(float(east.min()), 2),
            "east_max":    round(float(east.max()), 2),
            "north_min":   round(float(north.min()), 2),
            "north_max":   round(float(north.max()), 2),
            "z_min":       round(float(z_vals.min()), 2),
            "z_max":       round(float(z_vals.max()), 2),
        }
        hmap_path.write_text(json.dumps(hmap_data))

    return TerrainMesh(
        glb_path=output_path,
        vertex_count=len(vertices),
        face_count=len(faces),
        grid_shape=(grid_size, grid_size),
        z_min=float(z_vals.min()),
        z_max=float(z_vals.max()),
        z_mean=float(z_vals.mean()),
        origin=(origin_lat, origin_lon, 0.0),
        heightmap_path=hmap_path,
        stats={
            "relief_m":   round(float(z_vals.max() - z_vals.min()), 1),
            "vertices":   len(vertices),
            "triangles":  len(faces),
        },
    )
