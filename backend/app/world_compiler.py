"""
WorldManifest compiler for Adventure Mode.

Orchestrates P2-03 → P2-04 → P2-05 → P2-06 → P2-07 → P5-01 to produce a
self-contained world directory:

  worlds/<id>/
    manifest.json          ← schema below
    terrain.glb            ← 128×128 elevation mesh
    buildings.glb          ← extruded building prisms
    roads.json             ← validated ENU road graph
    heightmap.json         ← raw elevation grid for physics
    buildings_physics.json ← per-building AABB records
    terrain_features.json  ← slope, difficulty tiles, named features (P5-01)

Manifest schema:
  {
    "id":         "<16-char hex>",
    "created_at": "<ISO-8601 UTC>",
    "bbox": {"west": f, "south": f, "east": f, "north": f},
    "assets": {
      "terrain":           "terrain.glb",
      "buildings":         "buildings.glb",
      "roads":             "roads.json",
      "heightmap":         "heightmap.json",
      "buildings_physics": "buildings_physics.json",
      "terrain_features":  "terrain_features.json"
    },
    "stats": {
      "terrain":   {...},
      "buildings": {...},
      "roads":     {...},
      "features":  {slope summary},
      "elapsed_s": float
    }
  }
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.world_builder.building_processor import process_buildings
from app.world_builder.data_fetcher import fetch_osm_data
from app.world_builder.elevation_fetcher import fetch_elevation
from app.world_builder.road_processor import build_road_graph
from app.world_builder.terrain_processor import generate_terrain_mesh
from app.gameplay.terrain_analyzer import analyze_terrain

logger = logging.getLogger(__name__)

# ── Worlds directory ──────────────────────────────────────────────────────────

WORLDS_DIR = Path(os.getenv("WORLDS_DIR", Path(__file__).parent.parent / "worlds"))


def _world_id(west: float, south: float, east: float, north: float) -> str:
    """
    Deterministic 16-char hex ID from the bbox.
    Re-compiling the same bbox reuses the same world directory.
    """
    key = f"{west:.6f},{south:.6f},{east:.6f},{north:.6f}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


# ── Manifest dataclass ────────────────────────────────────────────────────────

@dataclass
class WorldManifest:
    id: str
    created_at: str
    bbox: dict[str, float]
    assets: dict[str, str]
    stats: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id":         self.id,
            "created_at": self.created_at,
            "bbox":       self.bbox,
            "assets":     self.assets,
            "stats":      self.stats,
        }

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(self.to_dict(), indent=2))


# ── Schema validator ──────────────────────────────────────────────────────────

def validate_manifest(data: dict) -> list[str]:
    """Return a list of validation errors (empty → valid)."""
    errors: list[str] = []
    for key in ("id", "created_at", "bbox", "assets"):
        if key not in data:
            errors.append(f"missing key: {key!r}")
    bbox = data.get("bbox", {})
    for coord in ("west", "south", "east", "north"):
        if not isinstance(bbox.get(coord), (int, float)):
            errors.append(f"bbox.{coord} must be a number")
    assets = data.get("assets", {})
    for asset in ("terrain", "buildings", "roads"):
        if asset not in assets:
            errors.append(f"assets.{asset!r} missing")
    # heightmap and buildings_physics are optional (added later; old worlds may lack them)
    return errors


# ── Compiler ──────────────────────────────────────────────────────────────────

def compile_world(
    west: float,
    south: float,
    east: float,
    north: float,
    *,
    worlds_dir: Path | None = None,
    force_refresh: bool = False,
) -> WorldManifest:
    """
    Build (or reuse) a world for the given bounding box.

    On a warm cache (OSM + elevation tiles already downloaded) this runs in
    a few seconds.  Cold-cache can take 2–3 minutes for a 500 m bbox.

    Parameters
    ----------
    west, south, east, north : float
        Bounding box in WGS-84 degrees.
    worlds_dir : Path, optional
        Override the default ``backend/worlds/`` directory.
    force_refresh : bool
        Re-run all processors even if a manifest already exists.

    Returns
    -------
    WorldManifest
    """
    _worlds_dir = worlds_dir or WORLDS_DIR
    world_id = _world_id(west, south, east, north)
    world_dir = _worlds_dir / world_id
    manifest_path = world_dir / "manifest.json"

    # Return existing manifest if present and not forcing a refresh
    if not force_refresh and manifest_path.exists():
        data = json.loads(manifest_path.read_text())
        return WorldManifest(**{k: data[k] for k in ("id", "created_at", "bbox", "assets", "stats")})

    world_dir.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    logger.info("Compiling world %s for bbox (%s, %s, %s, %s)…",
                world_id, west, south, east, north)

    # ── 1. OSM features ───────────────────────────────────────────────────────
    osm = fetch_osm_data(west, south, east, north, force_refresh=force_refresh)

    # ── 2. Elevation raster ───────────────────────────────────────────────────
    elev = fetch_elevation(west, south, east, north, force_refresh=force_refresh)

    # ── 3. Terrain mesh ───────────────────────────────────────────────────────
    terrain = generate_terrain_mesh(
        elev.tif_path,
        output_path=world_dir / "terrain.glb",
        heightmap_path=world_dir / "heightmap.json",
    )

    # ── 4. Building prisms ────────────────────────────────────────────────────
    buildings = process_buildings(
        osm.buildings,
        west, south, east, north,
        output_path=world_dir / "buildings.glb",
        physics_path=world_dir / "buildings_physics.json",
    )

    # ── 5. Road graph ─────────────────────────────────────────────────────────
    roads = build_road_graph(osm.roads, west, south, east, north)
    roads.save(world_dir / "roads.json")

    # ── 6. Terrain feature analysis ───────────────────────────────────────────
    features = analyze_terrain(
        world_dir / "heightmap.json",
        output_path=world_dir / "terrain_features.json",
    )

    elapsed = round(time.time() - t0, 1)
    logger.info("World %s compiled in %.1f s", world_id, elapsed)

    manifest = WorldManifest(
        id=world_id,
        created_at=datetime.now(timezone.utc).isoformat(),
        bbox={"west": west, "south": south, "east": east, "north": north},
        assets={
            "terrain":            "terrain.glb",
            "buildings":          "buildings.glb",
            "roads":              "roads.json",
            "heightmap":          "heightmap.json",
            "buildings_physics":  "buildings_physics.json",
            "terrain_features":   "terrain_features.json",
        },
        stats={
            "terrain":   terrain.stats,
            "buildings": buildings.stats,
            "roads":     roads.stats,
            "features":  features.summary,
            "elapsed_s": elapsed,
        },
    )
    manifest.save(manifest_path)
    return manifest
