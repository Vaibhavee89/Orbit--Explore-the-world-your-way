"""
OSM data fetcher for Adventure Mode world generation.

Fetches road network, building footprints, and POIs for a geographic bounding
box using OSMnx.  Raw Overpass responses are cached to disk by bbox hash so
repeated calls for the same region are instant.

Cache layout:
  .osm_cache/<hex8_of_bbox_hash>_roads.gpkg
  .osm_cache/<hex8_of_bbox_hash>_buildings.gpkg
  .osm_cache/<hex8_of_bbox_hash>_pois.gpkg
  .osm_cache/<hex8_of_bbox_hash>_meta.json
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import geopandas as gpd
import osmnx as ox

logger = logging.getLogger(__name__)

# ── Cache configuration ───────────────────────────────────────────────────────

_CACHE_DIR = Path(os.getenv("OSM_CACHE_DIR", Path(__file__).parent.parent.parent / ".osm_cache"))
_CACHE_TTL_S = int(os.getenv("OSM_CACHE_TTL", str(7 * 24 * 3600)))  # 7 days default


def _bbox_hash(west: float, south: float, east: float, north: float) -> str:
    key = f"{west:.6f},{south:.6f},{east:.6f},{north:.6f}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _cache_paths(h: str) -> dict[str, Path]:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return {
        "roads":     _CACHE_DIR / f"{h}_roads.gpkg",
        "buildings": _CACHE_DIR / f"{h}_buildings.gpkg",
        "pois":      _CACHE_DIR / f"{h}_pois.gpkg",
        "meta":      _CACHE_DIR / f"{h}_meta.json",
    }


def _cache_valid(paths: dict[str, Path]) -> bool:
    meta_path = paths["meta"]
    if not meta_path.exists():
        return False
    try:
        meta = json.loads(meta_path.read_text())
        return (time.time() - meta.get("fetched_at", 0)) < _CACHE_TTL_S
    except Exception:
        return False


# ── Fetch helpers ─────────────────────────────────────────────────────────────

def _fetch_roads(west: float, south: float, east: float, north: float) -> gpd.GeoDataFrame:
    """Return road edges as a GeoDataFrame (geometry=LineString)."""
    bbox = (west, south, east, north)  # osmnx v2: (left, bottom, right, top)
    G = ox.graph_from_bbox(bbox, network_type="all", retain_all=True)
    # Convert to GeoDataFrame of edges only
    # osmnx v2: nodes=False returns only the edges GeoDataFrame, not a tuple
    edges = ox.convert.graph_to_gdfs(G, nodes=False, edges=True)
    return edges.reset_index(drop=False)


def _fetch_features(
    west: float, south: float, east: float, north: float, tags: dict
) -> gpd.GeoDataFrame:
    bbox = (west, south, east, north)
    try:
        gdf = ox.features_from_bbox(bbox, tags=tags)
        return gdf.reset_index(drop=False)
    except Exception as exc:
        logger.warning("features_from_bbox(%s) returned empty: %s", tags, exc)
        return gpd.GeoDataFrame(geometry=gpd.GeoSeries([], crs="EPSG:4326"))


# ── Public result type ────────────────────────────────────────────────────────

@dataclass
class OSMData:
    """Container for the three OSM feature layers."""

    roads: gpd.GeoDataFrame
    buildings: gpd.GeoDataFrame
    pois: gpd.GeoDataFrame
    bbox: tuple[float, float, float, float]  # (west, south, east, north)
    from_cache: bool = False
    stats: dict[str, int] = field(default_factory=dict)

    def to_geojson(self) -> dict[str, Any]:
        """Serialise all layers to a single GeoJSON FeatureCollection."""
        features: list[dict] = []

        def _layer(gdf: gpd.GeoDataFrame, layer_name: str) -> None:
            if gdf.empty:
                return
            # Ensure WGS-84 before export
            projected = gdf.to_crs("EPSG:4326") if gdf.crs and gdf.crs.to_epsg() != 4326 else gdf
            for _, row in projected.iterrows():
                geom = row.geometry
                if geom is None or geom.is_empty:
                    continue
                props = {
                    k: (v if isinstance(v, (str, int, float, bool, type(None))) else str(v))
                    for k, v in row.drop("geometry").items()
                }
                props["_layer"] = layer_name
                features.append({
                    "type": "Feature",
                    "geometry": json.loads(gpd.GeoSeries([geom], crs="EPSG:4326").to_json())
                              ["features"][0]["geometry"],
                    "properties": props,
                })

        _layer(self.roads, "road")
        _layer(self.buildings, "building")
        _layer(self.pois, "poi")

        return {
            "type": "FeatureCollection",
            "bbox": list(self.bbox),
            "features": features,
            "stats": self.stats,
        }


# ── Main entry point ──────────────────────────────────────────────────────────

def fetch_osm_data(
    west: float,
    south: float,
    east: float,
    north: float,
    *,
    force_refresh: bool = False,
) -> OSMData:
    """
    Fetch OSM roads, buildings and POIs for the given bounding box.

    Results are cached to disk (`.osm_cache/`) keyed by a 16-char SHA-256
    prefix of the bbox string.  Set `force_refresh=True` to bypass cache.

    Parameters
    ----------
    west, south, east, north : float
        Bounding box in WGS-84 degrees.
    force_refresh : bool
        If True, ignore any existing cache and re-fetch from Overpass.

    Returns
    -------
    OSMData
        Dataclass with `.roads`, `.buildings`, `.pois` GeoDataFrames and
        a `.to_geojson()` helper.
    """
    h = _bbox_hash(west, south, east, north)
    paths = _cache_paths(h)
    bbox = (west, south, east, north)

    if not force_refresh and _cache_valid(paths):
        logger.info("OSM cache hit: %s", h)
        roads     = gpd.read_file(paths["roads"])     if paths["roads"].exists()     else gpd.GeoDataFrame()
        buildings = gpd.read_file(paths["buildings"]) if paths["buildings"].exists() else gpd.GeoDataFrame()
        pois      = gpd.read_file(paths["pois"])      if paths["pois"].exists()      else gpd.GeoDataFrame()
        stats = json.loads(paths["meta"].read_text()).get("stats", {})
        return OSMData(roads=roads, buildings=buildings, pois=pois,
                       bbox=bbox, from_cache=True, stats=stats)

    logger.info("Fetching OSM data for bbox %s (hash %s)…", bbox, h)
    t0 = time.time()

    roads     = _fetch_roads(west, south, east, north)
    buildings = _fetch_features(west, south, east, north, {"building": True})
    pois      = _fetch_features(west, south, east, north, {
        "amenity": True,
        "tourism": True,
        "shop":    True,
        "leisure": True,
    })

    elapsed = time.time() - t0
    stats = {
        "roads":     len(roads),
        "buildings": len(buildings),
        "pois":      len(pois),
        "elapsed_s": round(elapsed, 2),
    }
    logger.info("Fetched in %.1fs — roads=%d buildings=%d pois=%d",
                elapsed, stats["roads"], stats["buildings"], stats["pois"])

    # Persist to cache
    def _save(gdf: gpd.GeoDataFrame, path: Path) -> None:
        if not gdf.empty:
            # GPKG driver chokes on list/dict column values; drop them.
            safe = gdf[[c for c in gdf.columns
                         if gdf[c].dtype.name not in ("object",) or c == "geometry"
                         or gdf[c].apply(lambda v: isinstance(v, (str, type(None), float, int, bool))).all()]]
            try:
                safe.to_file(path, driver="GPKG")
            except Exception as exc:
                logger.warning("Cache write failed for %s: %s", path, exc)

    _save(roads, paths["roads"])
    _save(buildings, paths["buildings"])
    _save(pois, paths["pois"])
    paths["meta"].write_text(json.dumps({"fetched_at": time.time(), "stats": stats}))

    return OSMData(roads=roads, buildings=buildings, pois=pois,
                   bbox=bbox, from_cache=False, stats=stats)
