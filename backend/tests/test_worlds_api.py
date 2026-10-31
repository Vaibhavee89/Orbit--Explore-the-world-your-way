"""
End-to-end API tests for POST /worlds and GET /worlds/{id}.

Verifies the curl round-trip:
  1. POST /worlds with a SelectedLocation body
  2. Response contains full WorldManifest with asset_urls
  3. GET /worlds/{id} returns the same manifest
  4. Each asset URL (terrain, buildings, roads) is reachable via HTTP GET

Uses TestClient (functionally identical to curl for FastAPI apps).
"""

from __future__ import annotations

import json
import struct
import warnings

import pytest

warnings.filterwarnings("ignore", category=DeprecationWarning, module="starlette")

from fastapi.testclient import TestClient

from app.main import app
from app.world_compiler import _world_id, validate_manifest

WEST, SOUTH, EAST, NORTH = 77.183, 32.239, 77.195, 32.248

# Canonical SelectedLocation body for Manali bbox
MANALI_BODY = {
    "id": "manali-test-01",
    "label": "Old Manali Road, Manali",
    "box": {
        "west": WEST, "south": SOUTH, "east": EAST, "north": NORTH,
        "widthM": 1050.0, "heightM": 1000.0,
    },
    "center": {"lat": (SOUTH + NORTH) / 2, "lon": (WEST + EAST) / 2},
    "savedAt": 1700000000000,
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def world(client):
    """POST /worlds once; all tests share the response."""
    resp = client.post("/worlds", json=MANALI_BODY)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── POST /worlds ──────────────────────────────────────────────────────────────

class TestPostWorlds:

    def test_status_201(self, client):
        resp = client.post("/worlds", json=MANALI_BODY)
        assert resp.status_code == 201

    def test_response_has_id(self, world):
        assert "id" in world
        assert len(world["id"]) == 16

    def test_id_is_deterministic(self, client):
        r1 = client.post("/worlds", json=MANALI_BODY)
        r2 = client.post("/worlds", json=MANALI_BODY)
        assert r1.json()["id"] == r2.json()["id"]

    def test_response_has_bbox(self, world):
        bbox = world["bbox"]
        assert abs(bbox["west"]  - WEST)  < 1e-6
        assert abs(bbox["south"] - SOUTH) < 1e-6
        assert abs(bbox["east"]  - EAST)  < 1e-6
        assert abs(bbox["north"] - NORTH) < 1e-6

    def test_response_has_assets(self, world):
        assert set(world["assets"]) >= {"terrain", "buildings", "roads"}

    def test_response_has_asset_urls(self, world):
        assert "asset_urls" in world
        assert set(world["asset_urls"]) >= {"terrain", "buildings", "roads"}

    def test_asset_urls_start_with_worlds_prefix(self, world):
        world_id = world["id"]
        for key, url in world["asset_urls"].items():
            assert url.startswith(f"/worlds/{world_id}/"), \
                f"asset_urls.{key}={url!r} has wrong prefix"

    def test_response_has_stats(self, world):
        stats = world["stats"]
        assert "terrain" in stats
        assert "buildings" in stats
        assert "roads" in stats

    def test_manifest_schema_valid(self, world):
        errors = validate_manifest(world)
        assert errors == [], f"Manifest schema errors: {errors}"

    def test_invalid_bbox_422(self, client):
        """west ≥ east must be rejected."""
        bad_body = {**MANALI_BODY, "box": {**MANALI_BODY["box"], "west": EAST, "east": WEST}}
        resp = client.post("/worlds", json=bad_body)
        assert resp.status_code == 422

    def test_missing_required_fields_422(self, client):
        resp = client.post("/worlds", json={"id": "x"})
        assert resp.status_code == 422

    def test_healthz_unaffected(self, client):
        assert client.get("/healthz").json() == {"status": "ok"}


# ── GET /worlds/{id} ──────────────────────────────────────────────────────────

class TestGetWorld:

    def test_get_world_200(self, client, world):
        resp = client.get(f"/worlds/{world['id']}")
        assert resp.status_code == 200

    def test_get_world_returns_manifest(self, client, world):
        resp = client.get(f"/worlds/{world['id']}")
        data = resp.json()
        assert data["id"] == world["id"]
        assert "assets" in data
        assert "asset_urls" in data

    def test_get_world_schema_valid(self, client, world):
        resp = client.get(f"/worlds/{world['id']}")
        errors = validate_manifest(resp.json())
        assert errors == [], f"GET /worlds/{world['id']} manifest invalid: {errors}"

    def test_get_world_consistent_with_post(self, client, world):
        """GET /worlds/{id} must return the same manifest as POST."""
        get_resp = client.get(f"/worlds/{world['id']}")
        assert get_resp.json()["id"] == world["id"]
        assert get_resp.json()["bbox"] == world["bbox"]

    def test_get_unknown_world_404(self, client):
        resp = client.get("/worlds/deadbeef00000000")
        assert resp.status_code == 404


# ── Static asset round-trip (curl-equivalent) ─────────────────────────────────

class TestStaticAssets:
    """Fetch every generated asset via HTTP — mirrors a curl round-trip."""

    def test_terrain_glb_fetchable(self, client, world):
        url = world["asset_urls"]["terrain"]
        resp = client.get(url)
        assert resp.status_code == 200, f"GET {url} failed: {resp.status_code}"

    def test_buildings_glb_fetchable(self, client, world):
        url = world["asset_urls"]["buildings"]
        resp = client.get(url)
        assert resp.status_code == 200, f"GET {url} failed: {resp.status_code}"

    def test_roads_json_fetchable(self, client, world):
        url = world["asset_urls"]["roads"]
        resp = client.get(url)
        assert resp.status_code == 200, f"GET {url} failed: {resp.status_code}"

    def test_terrain_glb_magic(self, client, world):
        url = world["asset_urls"]["terrain"]
        content = client.get(url).content
        magic = struct.unpack("<I", content[:4])[0]
        assert magic == 0x46546C67, "terrain.glb is not a valid GLB"

    def test_buildings_glb_magic(self, client, world):
        url = world["asset_urls"]["buildings"]
        content = client.get(url).content
        magic = struct.unpack("<I", content[:4])[0]
        assert magic == 0x46546C67, "buildings.glb is not a valid GLB"

    def test_roads_json_valid(self, client, world):
        url = world["asset_urls"]["roads"]
        data = client.get(url).json()
        assert "nodes" in data and len(data["nodes"]) > 0
        assert "edges" in data and len(data["edges"]) > 0

    def test_manifest_json_fetchable(self, client, world):
        """manifest.json is also served as a static file."""
        url = f"/worlds/{world['id']}/manifest.json"
        resp = client.get(url)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == world["id"]
