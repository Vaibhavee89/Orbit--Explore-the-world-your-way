"""
Road graph builder for Adventure Mode world generation.

Converts the OSMnx edge GeoDataFrame (from data_fetcher.OSMData.roads) into
a simplified, serialisable graph:

  {
    "nodes": [{"id": <int>, "enu": {"e": <float>, "n": <float>}}, ...],
    "edges": [{"a": <int>, "b": <int>, "type": <str>, "length_m": <float>}, ...],
    "bbox":  {"west": ..., "south": ..., "east": ..., "north": ...}
  }

Node positions are extracted from the endpoints of each edge geometry
(first coordinate = node u, last coordinate = node v), then projected to
ENU metres anchored at the bbox centroid (P2-02 ENUFrame).

Edge type resolution order:
  1. ``highway`` column (may be absent if GPKG serialisation dropped list values)
  2. ``ref``    column  (road reference number, e.g. "NH3")
  3. ``name``   column  (road name)
  4. ``"road"`` fallback
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.world_builder.coordinate_system import ENUFrame

# ── Road-type helpers ─────────────────────────────────────────────────────────

_SENTINEL = object()


def _coerce_str(val: Any) -> str | None:
    """Return a non-empty string, or None for NaN / None / list-wrapped values."""
    if val is None or val is _SENTINEL:
        return None
    # Detect pandas NaN without importing pandas
    try:
        if val != val:  # NaN
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(val, list):
        val = val[0] if val else None
        if val is None:
            return None
    s = str(val).strip()
    return s if s else None


def _extract_type(row: Any) -> str:
    """Extract road type string from an OSMnx edge row."""
    for col in ("highway", "ref", "name"):
        v = _coerce_str(row.get(col))
        if v is not None:
            return v
    return "road"


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class RoadGraph:
    """Simplified graph of road nodes and edges in ENU metres."""

    nodes: list[dict[str, Any]]           # [{id, enu:{e,n}}]
    edges: list[dict[str, Any]]           # [{a, b, type, length_m}]
    bbox: tuple[float, float, float, float]   # (west, south, east, north)
    stats: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        west, south, east, north = self.bbox
        return {
            "nodes": self.nodes,
            "edges": self.edges,
            "bbox": {"west": west, "south": south, "east": east, "north": north},
            "stats": self.stats,
        }

    def save(self, path: Path | str) -> None:
        Path(path).write_text(json.dumps(self.to_dict(), indent=2))


# ── Schema validator ──────────────────────────────────────────────────────────

_SCHEMA = {
    "type": "object",
    "required": ["nodes", "edges", "bbox"],
    "properties": {
        "nodes": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "enu"],
                "properties": {
                    "id": {"type": "integer"},
                    "enu": {
                        "type": "object",
                        "required": ["e", "n"],
                        "properties": {
                            "e": {"type": "number"},
                            "n": {"type": "number"},
                        },
                    },
                },
            },
        },
        "edges": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["a", "b", "type", "length_m"],
                "properties": {
                    "a":        {"type": "integer"},
                    "b":        {"type": "integer"},
                    "type":     {"type": "string"},
                    "length_m": {"type": "number"},
                },
            },
        },
        "bbox": {
            "type": "object",
            "required": ["west", "south", "east", "north"],
        },
    },
}


def validate_road_graph(data: dict) -> list[str]:
    """
    Return a list of validation errors (empty → valid).

    Validates structure without an external schema library.
    """
    errors: list[str] = []

    if not isinstance(data, dict):
        return ["root must be an object"]

    for key in ("nodes", "edges", "bbox"):
        if key not in data:
            errors.append(f"missing top-level key: {key!r}")

    nodes = data.get("nodes", [])
    if not isinstance(nodes, list):
        errors.append("'nodes' must be an array")
    else:
        for i, node in enumerate(nodes):
            if not isinstance(node.get("id"), int):
                errors.append(f"nodes[{i}].id must be integer")
            enu = node.get("enu", {})
            if not isinstance(enu.get("e"), (int, float)):
                errors.append(f"nodes[{i}].enu.e must be number")
            if not isinstance(enu.get("n"), (int, float)):
                errors.append(f"nodes[{i}].enu.n must be number")

    edges = data.get("edges", [])
    if not isinstance(edges, list):
        errors.append("'edges' must be an array")
    else:
        for i, edge in enumerate(edges):
            for ab in ("a", "b"):
                if not isinstance(edge.get(ab), int):
                    errors.append(f"edges[{i}].{ab} must be integer")
            if not isinstance(edge.get("type"), str):
                errors.append(f"edges[{i}].type must be string")
            if not isinstance(edge.get("length_m"), (int, float)):
                errors.append(f"edges[{i}].length_m must be number")

    bbox = data.get("bbox", {})
    if not isinstance(bbox, dict):
        errors.append("'bbox' must be an object")
    else:
        for k in ("west", "south", "east", "north"):
            if not isinstance(bbox.get(k), (int, float)):
                errors.append(f"bbox.{k} must be number")

    return errors


# ── Main entry point ──────────────────────────────────────────────────────────

def build_road_graph(
    roads_gdf: Any,
    west: float,
    south: float,
    east: float,
    north: float,
) -> RoadGraph:
    """
    Convert an OSMnx edge GeoDataFrame to a simplified ENU road graph.

    Parameters
    ----------
    roads_gdf : GeoDataFrame
        Edge table from :func:`fetch_osm_data` (``.roads``), with columns
        ``u``, ``v``, ``length``, ``geometry`` (LineString in EPSG:4326).
    west, south, east, north : float
        Bounding box; the ENU origin is placed at the centroid.

    Returns
    -------
    RoadGraph
    """
    origin_lat = (south + north) / 2
    origin_lon = (west  + east)  / 2
    frame = ENUFrame(origin_lat, origin_lon)

    # ── Extract unique node positions from edge endpoints ─────────────────────
    node_positions: dict[int, tuple[float, float]] = {}  # node_id → (lat, lon)

    for _, row in roads_gdf.iterrows():
        u = int(row["u"])
        v = int(row["v"])
        geom = row.geometry
        if geom is None or geom.is_empty or len(list(geom.coords)) < 2:
            continue
        coords = list(geom.coords)
        lon_u, lat_u = coords[0]
        lon_v, lat_v = coords[-1]
        if u not in node_positions:
            node_positions[u] = (lat_u, lon_u)
        if v not in node_positions:
            node_positions[v] = (lat_v, lon_v)

    # ── Build node list ───────────────────────────────────────────────────────
    node_list: list[dict[str, Any]] = []
    for node_id, (lat, lon) in node_positions.items():
        e, n, _ = frame.latlon_to_enu(lat, lon)
        node_list.append({
            "id":  node_id,
            "enu": {"e": round(e, 3), "n": round(n, 3)},
        })

    # ── Build edge list ───────────────────────────────────────────────────────
    edge_list: list[dict[str, Any]] = []
    for _, row in roads_gdf.iterrows():
        u = int(row["u"])
        v = int(row["v"])
        if u not in node_positions or v not in node_positions:
            continue
        length_raw = row.get("length")
        try:
            length_m = round(float(length_raw), 2)
        except (TypeError, ValueError):
            length_m = 0.0
        road_type = _extract_type(row)
        edge_list.append({
            "a":        u,
            "b":        v,
            "type":     road_type,
            "length_m": length_m,
        })

    stats: dict[str, Any] = {
        "node_count": len(node_list),
        "edge_count": len(edge_list),
        "total_length_m": round(
            sum(e["length_m"] for e in edge_list), 1
        ),
    }

    return RoadGraph(
        nodes=node_list,
        edges=edge_list,
        bbox=(west, south, east, north),
        stats=stats,
    )
