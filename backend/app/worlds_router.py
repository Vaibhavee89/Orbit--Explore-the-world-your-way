"""
FastAPI router for world compilation and serving.

Routes:
  POST /worlds          — compile a world from a bbox; returns manifest URL
  GET  /worlds/{id}/manifest.json  — served as StaticFiles (wired in main.py)
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.world_compiler import WORLDS_DIR, WorldManifest, compile_world

router = APIRouter(prefix="/worlds", tags=["worlds"])


# ── Request / response models ─────────────────────────────────────────────────

class BboxRequest(BaseModel):
    west:  float = Field(..., ge=-180, le=180)
    south: float = Field(..., ge=-90,  le=90)
    east:  float = Field(..., ge=-180, le=180)
    north: float = Field(..., ge=-90,  le=90)

    @model_validator(mode="after")
    def check_bbox(self) -> "BboxRequest":
        if self.west >= self.east:
            raise ValueError("west must be < east")
        if self.south >= self.north:
            raise ValueError("south must be < north")
        return self


class WorldCreatedResponse(BaseModel):
    id: str
    manifest_url: str
    created_at: str
    bbox: dict
    stats: dict


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("", status_code=201, response_model=WorldCreatedResponse)
async def create_world(body: BboxRequest) -> WorldCreatedResponse:
    """
    Compile (or return cached) world assets for the given bounding box.

    Runs the full pipeline synchronously:
      fetch OSM → fetch elevation → terrain mesh → buildings → roads → manifest

    On a warm cache this typically completes in < 5 s.
    """
    try:
        manifest: WorldManifest = compile_world(
            body.west, body.south, body.east, body.north,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return WorldCreatedResponse(
        id=manifest.id,
        manifest_url=f"/worlds/{manifest.id}/manifest.json",
        created_at=manifest.created_at,
        bbox=manifest.bbox,
        stats=manifest.stats,
    )
