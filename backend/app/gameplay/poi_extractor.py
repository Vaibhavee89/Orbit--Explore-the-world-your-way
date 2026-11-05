"""
POI/landmark extractor for Adventure Mode gameplay (P5-02).

Filters the OSM POI GeoDataFrame (produced by data_fetcher) for tourism,
historic and natural=peak/saddle/volcano features, converts each to an
ENU-positioned record, and writes ``pois.json`` to the world directory.

Output — pois.json:
{
  "count": int,
  "pois": [
    {
      "id":          "node/12345678",
      "name":        "Hadimba Temple",
      "category":    "historic",
      "subcategory": "temple",
      "latlon":      [32.2409, 77.1773],
      "enu":         [-84.2, 15.6],
      "tags":        {"historic": "temple", "religion": "hindu"}
    },
    ...
  ]
}

The world compiler also inlines this list into WorldManifest.pointsOfInterest.

Category mapping:
  OSM "tourism"  → category "tourism",  subcategory = tag value
  OSM "historic" → category "historic", subcategory = tag value
  OSM "natural" ∈ NATURAL_VALUES → category "natural_peak" (etc.)
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd

from app.world_builder.coordinate_system import ENUFrame

logger = logging.getLogger(__name__)

# ── OSM tag filters ───────────────────────────────────────────────────────────

# tourism — any value is included.
# historic — any value is included.
# natural — only these values are included (avoids coastline/water spam).
NATURAL_VALUES: frozenset[str] = frozenset({
    "peak", "saddle", "volcano", "ridge", "cliff", "cave_entrance",
})

# Maps the primary OSM tag column to a canonical category name.
_CATEGORY_MAP = {
    "tourism":  "tourism",
    "historic": "historic",
    "natural":  "natural",
}


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class PoiRecord:
    id:          str
    name:        str
    category:    str                      # "tourism" | "historic" | "natural"
    subcategory: str                      # tag value, e.g. "peak", "temple"
    latlon:      list[float]              # [lat, lon] WGS-84
    enu:         list[float]              # [east, north] metres from bbox centroid
    tags:        dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── Core logic ────────────────────────────────────────────────────────────────

def _is_nan(v: Any) -> bool:
    try:
        return pd.isna(v)
    except (TypeError, ValueError):
        return False


def _str_tag(row: Any, col: str) -> str | None:
    """Return the tag value as a string if the column exists and is not NaN."""
    if col not in row.index:
        return None
    v = row[col]
    if _is_nan(v):
        return None
    return str(v).strip()


def _osm_id(row: Any) -> str:
    """Build a human-readable OSM id like 'node/12345678'."""
    elem_type = _str_tag(row, "element_type") or "element"
    osmid     = _str_tag(row, "osmid") or "?"
    return f"{elem_type}/{osmid}"


def _centroid_latlon(geom: Any) -> tuple[float, float] | None:
    """Return (lat, lon) for any geometry type; None if geometry is invalid."""
    try:
        if geom is None or geom.is_empty:
            return None
        pt = geom if geom.geom_type == "Point" else geom.centroid
        return (pt.y, pt.x)   # lat = y, lon = x
    except Exception:
        return None


def _extract_tags(row: Any, skip_cols: frozenset[str]) -> dict[str, str]:
    """Pull all non-empty string tag columns from a GeoDataFrame row."""
    tags: dict[str, str] = {}
    for col in row.index:
        if col in skip_cols or col == "geometry":
            continue
        v = _str_tag(row, col)
        if v and v not in ("nan", "None"):
            tags[col] = v
    return tags


_SKIP_COLS = frozenset({"osmid", "element_type", "geometry"})


def _row_to_record(
    row: Any,
    frame: ENUFrame,
) -> PoiRecord | None:
    """
    Convert one GeoDataFrame row to a PoiRecord.

    Determines category by checking which of the target tag columns is
    non-null; the first match wins (priority: tourism > historic > natural).
    Returns None if no target tag is present or geometry is invalid.
    """
    # ── Determine category ────────────────────────────────────────────────────
    category = subcategory = ""
    for col, cat in _CATEGORY_MAP.items():
        val = _str_tag(row, col)
        if val and not _is_nan(val):
            # For natural, only include specific values.
            if col == "natural" and val not in NATURAL_VALUES:
                continue
            category    = cat
            subcategory = val
            break

    if not category:
        return None

    # ── Geometry → lat/lon ────────────────────────────────────────────────────
    latlon_pair = _centroid_latlon(row.geometry)
    if latlon_pair is None:
        return None
    lat, lon = latlon_pair

    # ── ENU conversion ────────────────────────────────────────────────────────
    east, north, _ = frame.latlon_to_enu(lat, lon)

    # ── Name ─────────────────────────────────────────────────────────────────
    name = _str_tag(row, "name") or ""

    # ── Tags (secondary metadata) ─────────────────────────────────────────────
    tags = _extract_tags(row, _SKIP_COLS)

    return PoiRecord(
        id          = _osm_id(row),
        name        = name,
        category    = category,
        subcategory = subcategory,
        latlon      = [round(lat, 6), round(lon, 6)],
        enu         = [round(east, 1), round(north, 1)],
        tags        = tags,
    )


# ── Main entry point ──────────────────────────────────────────────────────────

def extract_pois(
    pois_gdf: gpd.GeoDataFrame,
    west: float,
    south: float,
    east: float,
    north: float,
    *,
    output_path: Path | str | None = None,
) -> list[PoiRecord]:
    """
    Filter and convert OSM POI features to ENU-positioned POI records.

    Parameters
    ----------
    pois_gdf : GeoDataFrame
        Raw POI GeoDataFrame from :func:`fetch_osm_data` — may include rows
        with tourism, historic, natural, amenity, leisure, shop columns.
    west, south, east, north : float
        Bounding box in WGS-84 degrees; the bbox centroid is used as the
        ENU frame origin (same convention as terrain_processor).
    output_path : Path | str | None
        If given, write ``pois.json`` to this path.

    Returns
    -------
    list[PoiRecord]
        Filtered, deduplicated POI records sorted by category then name.
    """
    origin_lat = (south + north) / 2
    origin_lon = (west  + east)  / 2
    frame = ENUFrame(origin_lat, origin_lon)

    records: list[PoiRecord] = []
    seen_ids: set[str] = set()

    if pois_gdf.empty:
        logger.info("[POI] GeoDataFrame is empty — no POIs found")
    else:
        for _, row in pois_gdf.iterrows():
            try:
                rec = _row_to_record(row, frame)
            except Exception as exc:
                logger.debug("[POI] Skipped row due to error: %s", exc)
                continue
            if rec is None:
                continue
            if rec.id in seen_ids:
                continue
            seen_ids.add(rec.id)
            records.append(rec)

    records.sort(key=lambda r: (r.category, r.name or r.id))
    logger.info("[POI] Extracted %d POIs (tourism=%d historic=%d natural=%d)",
                len(records),
                sum(1 for r in records if r.category == "tourism"),
                sum(1 for r in records if r.category == "historic"),
                sum(1 for r in records if r.category == "natural"))

    if output_path is not None:
        output_path = Path(output_path)
        output_path.write_text(json.dumps({
            "count": len(records),
            "pois":  [r.to_dict() for r in records],
        }))

    return records
