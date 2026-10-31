"""
Building extrusion for Adventure Mode world generation.

Converts OSM building footprints (from data_fetcher.OSMData) into extruded
3D prisms and exports them as a single GLB file.

Height resolution order:
  1. OSM tag  ``height``        (raw metres, e.g. "12" or "12 m")
  2. OSM tag  ``building:levels`` or ``levels``  (× 3.5 m per storey)
  3. Default height (6 m)

Coordinate system:
  ENU anchored at the bbox centroid (same convention as terrain_processor).
  X = East, Y = North, Z = Up.  Building bases sit at Z = 0.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import trimesh
import trimesh.creation
from shapely.geometry import MultiPolygon, Polygon

from app.world_builder.coordinate_system import ENUFrame

logger = logging.getLogger(__name__)

_DEFAULT_HEIGHT = 6.0  # metres


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class BuildingMesh:
    """Combined building mesh and provenance."""

    glb_path: Path
    building_count: int          # number of extruded prisms
    skipped_count: int           # geometries that could not be extruded
    bbox: tuple[float, float, float, float]   # (west, south, east, north)
    stats: dict[str, Any] = field(default_factory=dict)


# ── Height helpers ────────────────────────────────────────────────────────────

def _extract_height(row: Any, default: float = _DEFAULT_HEIGHT) -> float:
    """Return building height in metres from OSM tags, or *default*."""
    for tag in ("height", "building:height"):
        val = row.get(tag)
        if val is not None and val == val:  # not NaN
            try:
                return float(str(val).replace("m", "").strip())
            except (ValueError, AttributeError):
                pass
    for tag in ("building:levels", "levels"):
        val = row.get(tag)
        if val is not None and val == val:
            try:
                return max(1.0, float(str(val).strip())) * 3.5
            except (ValueError, AttributeError):
                pass
    return default


# ── Geometry helpers ──────────────────────────────────────────────────────────

def _to_polygons(geom: Any) -> list[Polygon]:
    """Flatten a Shapely geometry to a list of Polygon parts."""
    if isinstance(geom, Polygon):
        return [geom] if not geom.is_empty else []
    if isinstance(geom, MultiPolygon):
        return [p for p in geom.geoms if not p.is_empty]
    return []


def _latlon_ring_to_enu(
    coords: Any,
    frame: ENUFrame,
) -> list[tuple[float, float]]:
    """Convert a ring of (lon, lat) pairs to ENU (E, N) metre pairs."""
    result = []
    for lon, lat in coords:
        e, n, _ = frame.latlon_to_enu(lat, lon)
        result.append((e, n))
    return result


def _geom_to_enu_poly(poly: Polygon, frame: ENUFrame) -> Polygon | None:
    """
    Project a lon/lat Polygon into the ENU plane.

    Returns None if the resulting polygon is degenerate.
    """
    exterior = _latlon_ring_to_enu(poly.exterior.coords, frame)
    holes = [
        _latlon_ring_to_enu(ring.coords, frame) for ring in poly.interiors
    ]
    try:
        enu = Polygon(exterior, holes)
        # Require valid, non-degenerate geometry (> 1 m² to filter slivers)
        if enu.is_valid and not enu.is_empty and enu.area > 1.0:
            return enu
        # Try buffer(0) to fix minor self-intersections
        fixed = enu.buffer(0)
        if not fixed.is_empty and fixed.area > 1.0:
            return fixed if isinstance(fixed, Polygon) else None
    except Exception:
        pass
    return None


def _try_extrude(enu_poly: Polygon, height: float) -> trimesh.Trimesh | None:
    """Extrude a 2D ENU polygon to a prism mesh. Returns None on failure."""
    try:
        mesh = trimesh.creation.extrude_polygon(enu_poly, height)
        if mesh is not None and len(mesh.vertices) > 0:
            return mesh
    except Exception as exc:
        logger.debug("extrude_polygon failed: %s", exc)
    return None


# ── Main entry point ──────────────────────────────────────────────────────────

def process_buildings(
    buildings_gdf: Any,          # geopandas.GeoDataFrame from OSMData.buildings
    west: float,
    south: float,
    east: float,
    north: float,
    *,
    output_path: Path | str,
    default_height: float = _DEFAULT_HEIGHT,
) -> BuildingMesh:
    """
    Extrude building footprints and export a combined GLB.

    Parameters
    ----------
    buildings_gdf : GeoDataFrame
        Building footprints in EPSG:4326 (from :func:`fetch_osm_data`).
    west, south, east, north : float
        Bounding box used as context (origin of the ENU frame is the centroid).
    output_path : Path | str
        Destination GLB file.
    default_height : float
        Fallback height in metres when no OSM height tag is found.

    Returns
    -------
    BuildingMesh
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    origin_lat = (south + north) / 2
    origin_lon = (west  + east)  / 2
    frame = ENUFrame(origin_lat, origin_lon)

    geometries: dict[str, trimesh.Trimesh] = {}
    skipped = 0
    heights: list[float] = []

    for _, row in buildings_gdf.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            skipped += 1
            continue

        height = _extract_height(row, default=default_height)
        building_id = row.get("id", row.get("osmid", id(row)))

        parts = _to_polygons(geom)
        for part_idx, poly in enumerate(parts):
            enu_poly = _geom_to_enu_poly(poly, frame)
            if enu_poly is None:
                skipped += 1
                continue

            mesh = _try_extrude(enu_poly, height)
            if mesh is None:
                skipped += 1
                continue

            key = f"{building_id}" if part_idx == 0 else f"{building_id}_{part_idx}"
            geometries[key] = mesh
            heights.append(height)

    if not geometries:
        raise ValueError(
            f"No buildings could be extruded (skipped {skipped}). "
            "Check that the GeoDataFrame contains valid polygon geometries."
        )

    scene = trimesh.Scene(geometries)
    scene.export(str(output_path))

    h_arr = np.array(heights)
    stats: dict[str, Any] = {
        "buildings":      len(geometries),
        "skipped":        skipped,
        "height_min_m":   float(h_arr.min()),
        "height_max_m":   float(h_arr.max()),
        "height_mean_m":  float(h_arr.mean()),
        "default_pct":    float((h_arr == default_height).mean() * 100),
    }
    logger.info(
        "Extruded %d buildings (skipped %d); heights %.1f–%.1f m",
        len(geometries), skipped, h_arr.min(), h_arr.max(),
    )

    return BuildingMesh(
        glb_path=output_path,
        building_count=len(geometries),
        skipped_count=skipped,
        bbox=(west, south, east, north),
        stats=stats,
    )
