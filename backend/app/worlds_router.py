"""
FastAPI router for world compilation and serving.

Routes:
  POST /worlds        — accept SelectedLocation; compile world; return WorldManifest
  GET  /worlds/{id}   — return manifest JSON for an existing world
  GET  /worlds/{id}/… — static GLB / JSON assets served via StaticFiles (main.py)

SelectedLocation schema mirrors the TypeScript type defined in
src/geospatial/types.ts (P1-04):

  interface BoundingBox { north, south, east, west, widthM, heightM }
  interface SelectedLocation { id, label, box: BoundingBox, center, savedAt }
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.world_compiler import WORLDS_DIR, WorldManifest, compile_world

router = APIRouter(prefix="/worlds", tags=["worlds"])


# ── Request models ────────────────────────────────────────────────────────────

class BoundingBox(BaseModel):
    """Mirror of the TypeScript BoundingBox interface."""
    north:   float = Field(..., ge=-90,  le=90)
    south:   float = Field(..., ge=-90,  le=90)
    east:    float = Field(..., ge=-180, le=180)
    west:    float = Field(..., ge=-180, le=180)
    widthM:  float = Field(0.0, ge=0)
    heightM: float = Field(0.0, ge=0)

    @model_validator(mode="after")
    def check_bbox(self) -> "BoundingBox":
        if self.west >= self.east:
            raise ValueError("west must be < east")
        if self.south >= self.north:
            raise ValueError("south must be < north")
        return self


class Center(BaseModel):
    lat: float
    lon: float


class SelectedLocation(BaseModel):
    """Mirror of the TypeScript SelectedLocation interface."""
    id:      str
    label:   str
    box:     BoundingBox
    center:  Center
    savedAt: int  # Unix ms timestamp


# ── Response model ────────────────────────────────────────────────────────────

class WorldManifestResponse(BaseModel):
    """Full WorldManifest returned directly from POST /worlds and GET /worlds/{id}."""
    id:         str
    created_at: str
    bbox:       dict
    assets:     dict   # {terrain, buildings, roads} → relative filenames
    asset_urls: dict   # same keys → absolute /worlds/{id}/{file} URLs
    stats:      dict


def _manifest_to_response(manifest: WorldManifest) -> WorldManifestResponse:
    base = f"/worlds/{manifest.id}"
    return WorldManifestResponse(
        id=manifest.id,
        created_at=manifest.created_at,
        bbox=manifest.bbox,
        assets=manifest.assets,
        asset_urls={k: f"{base}/{v}" for k, v in manifest.assets.items()},
        stats=manifest.stats,
    )


# ── POST /worlds ──────────────────────────────────────────────────────────────

@router.post("", status_code=201, response_model=WorldManifestResponse)
async def create_world(body: SelectedLocation) -> WorldManifestResponse:
    """
    Compile (or return cached) world assets for the given SelectedLocation.

    Extracts the bounding box from ``body.box`` and runs the full pipeline:
      fetch OSM → elevation → terrain mesh → buildings → road graph → manifest

    On a warm cache this typically completes in < 5 s.
    """
    box = body.box
    try:
        manifest: WorldManifest = compile_world(
            box.west, box.south, box.east, box.north,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return _manifest_to_response(manifest)


# ── GET /worlds/{id} ──────────────────────────────────────────────────────────

@router.get("/{world_id}", response_model=WorldManifestResponse)
async def get_world(world_id: str) -> WorldManifestResponse:
    """Return the manifest for an existing compiled world."""
    manifest_path = WORLDS_DIR / world_id / "manifest.json"
    if not manifest_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"World {world_id!r} not found. "
                   "Compile it first with POST /worlds.",
        )
    data = json.loads(manifest_path.read_text())
    manifest = WorldManifest(
        id=data["id"],
        created_at=data["created_at"],
        bbox=data["bbox"],
        assets=data["assets"],
        stats=data.get("stats", {}),
    )
    return _manifest_to_response(manifest)
