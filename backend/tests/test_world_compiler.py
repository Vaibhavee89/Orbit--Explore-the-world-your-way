"""
Tests for world_compiler and the POST /worlds endpoint.

Reuses cached OSM + elevation data from earlier tickets (P2-03, P2-04).
On a warm cache the full compile runs in < 10 s.
"""

from __future__ import annotations

import json
import warnings
from pathlib import Path

import pytest

# Suppress httpx deprecation warning from starlette's TestClient
warnings.filterwarnings("ignore", category=DeprecationWarning, module="starlette")

from fastapi.testclient import TestClient

from app.main import app
from app.world_compiler import (
    WORLDS_DIR,
    WorldManifest,
    _world_id,
    compile_world,
    validate_manifest,
)

WEST, SOUTH, EAST, NORTH = 77.183, 32.239, 77.195, 32.248


# ── compile_world unit tests (no HTTP) ───────────────────────────────────────

@pytest.fixture(scope="module")
def manifest(tmp_path_factory) -> WorldManifest:
    """Compile once; all tests in module share the result."""
    worlds = tmp_path_factory.mktemp("worlds")
    return compile_world(WEST, SOUTH, EAST, NORTH, worlds_dir=worlds)


class TestCompiler:

    def test_returns_world_manifest(self, manifest: WorldManifest):
        assert isinstance(manifest, WorldManifest)

    def test_id_is_16_hex_chars(self, manifest: WorldManifest):
        assert len(manifest.id) == 16
        assert all(c in "0123456789abcdef" for c in manifest.id)

    def test_deterministic_id(self):
        id1 = _world_id(WEST, SOUTH, EAST, NORTH)
        id2 = _world_id(WEST, SOUTH, EAST, NORTH)
        assert id1 == id2

    def test_different_bbox_different_id(self):
        id1 = _world_id(WEST, SOUTH, EAST, NORTH)
        id2 = _world_id(WEST + 0.001, SOUTH, EAST, NORTH)
        assert id1 != id2

    def test_created_at_is_iso(self, manifest: WorldManifest):
        from datetime import datetime
        # Must parse without error
        datetime.fromisoformat(manifest.created_at.replace("Z", "+00:00"))

    def test_bbox_matches_input(self, manifest: WorldManifest):
        assert manifest.bbox["west"]  == pytest.approx(WEST)
        assert manifest.bbox["south"] == pytest.approx(SOUTH)
        assert manifest.bbox["east"]  == pytest.approx(EAST)
        assert manifest.bbox["north"] == pytest.approx(NORTH)

    def test_assets_keys_present(self, manifest: WorldManifest):
        assert set(manifest.assets) >= {"terrain", "buildings", "roads"}

    def test_stats_present(self, manifest: WorldManifest):
        assert "terrain" in manifest.stats
        assert "buildings" in manifest.stats
        assert "roads" in manifest.stats


class TestFiles:

    def test_manifest_json_written(self, manifest: WorldManifest, tmp_path_factory):
        worlds = tmp_path_factory.mktemp("worlds_files")
        m = compile_world(WEST, SOUTH, EAST, NORTH, worlds_dir=worlds)
        manifest_path = worlds / m.id / "manifest.json"
        assert manifest_path.exists()

    def test_terrain_glb_written(self, manifest: WorldManifest, tmp_path_factory):
        worlds = tmp_path_factory.mktemp("worlds_terrain")
        m = compile_world(WEST, SOUTH, EAST, NORTH, worlds_dir=worlds)
        assert (worlds / m.id / "terrain.glb").exists()

    def test_buildings_glb_written(self, manifest: WorldManifest, tmp_path_factory):
        worlds = tmp_path_factory.mktemp("worlds_buildings")
        m = compile_world(WEST, SOUTH, EAST, NORTH, worlds_dir=worlds)
        assert (worlds / m.id / "buildings.glb").exists()

    def test_roads_json_written(self, manifest: WorldManifest, tmp_path_factory):
        worlds = tmp_path_factory.mktemp("worlds_roads")
        m = compile_world(WEST, SOUTH, EAST, NORTH, worlds_dir=worlds)
        roads_path = worlds / m.id / "roads.json"
        assert roads_path.exists()
        data = json.loads(roads_path.read_text())
        assert "nodes" in data and "edges" in data

    def test_cache_reuse(self, tmp_path_factory):
        worlds = tmp_path_factory.mktemp("worlds_cache")
        m1 = compile_world(WEST, SOUTH, EAST, NORTH, worlds_dir=worlds)
        m2 = compile_world(WEST, SOUTH, EAST, NORTH, worlds_dir=worlds)
        assert m1.id == m2.id
        assert m1.created_at == m2.created_at  # same cached manifest


# ── validate_manifest ─────────────────────────────────────────────────────────

class TestValidateManifest:

    def test_valid_manifest(self, manifest: WorldManifest):
        errors = validate_manifest(manifest.to_dict())
        assert errors == []

    def test_missing_id(self):
        bad = {"created_at": "x", "bbox": {}, "assets": {}}
        errors = validate_manifest(bad)
        assert any("id" in e for e in errors)

    def test_missing_bbox_coord(self):
        bad = {
            "id": "abc", "created_at": "x",
            "bbox": {"west": 0, "south": 0, "east": 1},  # missing north
            "assets": {"terrain": "t.glb", "buildings": "b.glb", "roads": "r.json"},
        }
        errors = validate_manifest(bad)
        assert any("north" in e for e in errors)

    def test_missing_asset(self):
        bad = {
            "id": "abc", "created_at": "x",
            "bbox": {"west": 0, "south": 0, "east": 1, "north": 1},
            "assets": {"terrain": "t.glb"},  # missing buildings and roads
        }
        errors = validate_manifest(bad)
        assert any("buildings" in e for e in errors)


# ── HTTP endpoint ─────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


class TestPostWorlds:

    def test_post_worlds_201(self, client):
        resp = client.post("/worlds", json={
            "west": WEST, "south": SOUTH, "east": EAST, "north": NORTH,
        })
        assert resp.status_code == 201

    def test_response_has_manifest_url(self, client):
        resp = client.post("/worlds", json={
            "west": WEST, "south": SOUTH, "east": EAST, "north": NORTH,
        })
        data = resp.json()
        assert "manifest_url" in data
        assert data["manifest_url"].endswith("manifest.json")

    def test_response_has_id(self, client):
        resp = client.post("/worlds", json={
            "west": WEST, "south": SOUTH, "east": EAST, "north": NORTH,
        })
        data = resp.json()
        assert "id" in data
        assert len(data["id"]) == 16

    def test_response_has_stats(self, client):
        resp = client.post("/worlds", json={
            "west": WEST, "south": SOUTH, "east": EAST, "north": NORTH,
        })
        data = resp.json()
        assert "stats" in data

    def test_manifest_url_is_fetchable(self, client):
        resp = client.post("/worlds", json={
            "west": WEST, "south": SOUTH, "east": EAST, "north": NORTH,
        })
        manifest_url = resp.json()["manifest_url"]
        manifest_resp = client.get(manifest_url)
        assert manifest_resp.status_code == 200

    def test_manifest_schema_valid(self, client):
        resp = client.post("/worlds", json={
            "west": WEST, "south": SOUTH, "east": EAST, "north": NORTH,
        })
        manifest_url = resp.json()["manifest_url"]
        manifest = client.get(manifest_url).json()
        errors = validate_manifest(manifest)
        assert errors == [], f"Manifest invalid: {errors}"

    def test_idempotent_same_id(self, client):
        r1 = client.post("/worlds", json={
            "west": WEST, "south": SOUTH, "east": EAST, "north": NORTH,
        })
        r2 = client.post("/worlds", json={
            "west": WEST, "south": SOUTH, "east": EAST, "north": NORTH,
        })
        assert r1.json()["id"] == r2.json()["id"]

    def test_invalid_bbox_422(self, client):
        """west >= east should be rejected."""
        resp = client.post("/worlds", json={
            "west": EAST, "south": SOUTH, "east": WEST, "north": NORTH,
        })
        assert resp.status_code == 422

    def test_healthz_still_works(self, client):
        assert client.get("/healthz").json() == {"status": "ok"}
