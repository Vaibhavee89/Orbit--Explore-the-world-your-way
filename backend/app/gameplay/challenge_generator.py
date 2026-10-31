"""
Deterministic challenge generator for Adventure Mode gameplay (P5-03).

Produces a ``challenges`` list on the WorldManifest from terrain features
(P5-01) and POI records (P5-02).  The same world always yields identical
challenges: the seeded RNG is keyed to ``world_id`` so no randomness leaks
across runs.

Five rule types
---------------
navigation    — reach a target ENU point within a given radius
elevation     — climb to a specific elevation or gain a set amount
discovery     — find / reach a named POI or natural feature
route_select  — travel from A → B while respecting a terrain constraint
environmental — traverse a zone while avoiding forbidden difficulty tiles

Challenge schema
----------------
{
  "id":          "<12-char hex>",     # deterministic SHA-256 prefix
  "type":        "navigation",        # one of the 5 types above
  "title":       "Summit Trek",
  "description": "...",
  "difficulty":  "medium",           # "easy" | "medium" | "hard" | "extreme"
  "reward_xp":   150,
  "params":      { ... }             # type-specific; all values are JSON-safe
}
"""

from __future__ import annotations

import hashlib
import json
import math
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# ── Difficulty helpers ────────────────────────────────────────────────────────

_XP: dict[str, int] = {
    "easy":    50,
    "medium":  150,
    "hard":    300,
    "extreme": 600,
}

_TILE_DIFFICULTY_TO_CHALLENGE: dict[str, str] = {
    "flat":     "easy",
    "easy":     "easy",
    "moderate": "medium",
    "steep":    "hard",
    "cliff":    "extreme",
}


def _challenge_difficulty(tile_class: str) -> str:
    return _TILE_DIFFICULTY_TO_CHALLENGE.get(tile_class, "medium")


def _relief_difficulty(z_min: float, z_max: float) -> str:
    relief = z_max - z_min
    if relief < 50:
        return "easy"
    if relief < 150:
        return "medium"
    if relief < 400:
        return "hard"
    return "extreme"


def _slope_difficulty(mean_slope_deg: float) -> str:
    if mean_slope_deg < 5:
        return "easy"
    if mean_slope_deg < 15:
        return "medium"
    if mean_slope_deg < 25:
        return "hard"
    return "extreme"


# ── Deterministic ID ──────────────────────────────────────────────────────────

def _challenge_id(world_id: str, rule_type: str, index: int) -> str:
    key = f"{world_id}:{rule_type}:{index}"
    return hashlib.sha256(key.encode()).hexdigest()[:12]


# ── Challenge dataclass ───────────────────────────────────────────────────────

@dataclass
class Challenge:
    id:          str
    type:        str
    title:       str
    description: str
    difficulty:  str
    reward_xp:   int
    params:      dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── Rule engines ──────────────────────────────────────────────────────────────

def _navigation_rules(
    world_id: str,
    rng: random.Random,
    named_features: list[dict[str, Any]],
    poi_records: list[dict[str, Any]],
    east_half: float,
    north_half: float,
) -> list[Challenge]:
    """
    Navigation — reach a waypoint within 30 m.

    Up to 2 challenges:
      1. If a summit exists → trek to the highest summit.
      2. If a POI exists → navigate to a POI (prefer natural > tourism > historic).
      Fallback: head to a random ENU point in the eastern or northern quadrant.
    """
    results: list[Challenge] = []

    summits = sorted(
        [f for f in named_features if f["type"] == "summit"],
        key=lambda f: f["elevation_m"],
        reverse=True,
    )

    # Challenge 1: summit navigation
    if summits:
        s = summits[0]
        diff = "hard" if s["elevation_m"] > 3000 else "medium"
        results.append(Challenge(
            id=_challenge_id(world_id, "navigation", 0),
            type="navigation",
            title="Summit Trek",
            description=(
                f"Navigate to the highest point in the area, "
                f"at {s['elevation_m']:.0f} m elevation."
            ),
            difficulty=diff,
            reward_xp=_XP[diff],
            params={
                "target_enu": s["enu"],
                "target_elevation_m": s["elevation_m"],
                "radius_m": 30.0,
                "hint": "Head for the highest ground visible from your position.",
            },
        ))
    else:
        # Fallback: random waypoint in the NE quadrant
        target = [
            round(rng.uniform(east_half * 0.2, east_half * 0.8), 1),
            round(rng.uniform(north_half * 0.2, north_half * 0.8), 1),
        ]
        results.append(Challenge(
            id=_challenge_id(world_id, "navigation", 0),
            type="navigation",
            title="Waypoint Recon",
            description="Reach the marked waypoint in the field.",
            difficulty="easy",
            reward_xp=_XP["easy"],
            params={"target_enu": target, "radius_m": 30.0},
        ))

    # Challenge 2: navigate to a natural POI or tourism POI
    natural_pois = [p for p in poi_records if p["category"] == "natural"]
    tourism_pois = [p for p in poi_records if p["category"] == "tourism"]
    candidates   = natural_pois or tourism_pois

    if candidates:
        poi = rng.choice(candidates)
        name = poi["name"] or poi["subcategory"].replace("_", " ").title()
        diff = "medium"
        results.append(Challenge(
            id=_challenge_id(world_id, "navigation", 1),
            type="navigation",
            title=f"Reach {name}",
            description=f"Find and navigate to {name}.",
            difficulty=diff,
            reward_xp=_XP[diff],
            params={
                "target_enu": poi["enu"],
                "radius_m": 25.0,
                "poi_id": poi["id"],
                "hint": poi["name"] or "",
            },
        ))

    return results


def _elevation_rules(
    world_id: str,
    rng: random.Random,
    named_features: list[dict[str, Any]],
    z_min: float,
    z_max: float,
) -> list[Challenge]:
    """
    Elevation — climb to a target altitude or gain X metres.

    Up to 2 challenges:
      1. Reach the highest summit's elevation (if relief ≥ 20 m).
      2. Gain half the total relief from any starting point.
    """
    results: list[Challenge] = []
    relief = z_max - z_min

    if relief < 10:
        return results   # too flat — no elevation challenges

    diff = _relief_difficulty(z_min, z_max)
    summits = sorted(
        [f for f in named_features if f["type"] == "summit"],
        key=lambda f: f["elevation_m"],
        reverse=True,
    )

    # Challenge 1: reach the peak elevation
    if summits:
        s = summits[0]
        results.append(Challenge(
            id=_challenge_id(world_id, "elevation", 0),
            type="elevation",
            title="Altitude Assault",
            description=(
                f"Climb to an elevation of at least {s['elevation_m']:.0f} m above sea level."
            ),
            difficulty=diff,
            reward_xp=_XP[diff],
            params={
                "target_elevation_m": s["elevation_m"],
                "target_enu": s["enu"],
                "tolerance_m": 10.0,
            },
        ))

    # Challenge 2: gain a fixed amount of elevation
    gain_target = round(relief * 0.5)
    if gain_target >= 10:
        diff2 = "medium" if gain_target < 200 else "hard"
        results.append(Challenge(
            id=_challenge_id(world_id, "elevation", 1),
            type="elevation",
            title="Elevation Gain",
            description=f"Gain at least {gain_target} m of elevation during your run.",
            difficulty=diff2,
            reward_xp=_XP[diff2],
            params={"gain_m": float(gain_target)},
        ))

    return results


def _discovery_rules(
    world_id: str,
    rng: random.Random,
    poi_records: list[dict[str, Any]],
) -> list[Challenge]:
    """
    Discovery — reach specific POIs.

    Up to 3 challenges: one per distinct category (tourism, historic, natural).
    Picks randomly (seeded) from each category.
    """
    results: list[Challenge] = []
    by_category: dict[str, list[dict]] = {}
    for p in poi_records:
        by_category.setdefault(p["category"], []).append(p)

    category_order = ["historic", "tourism", "natural"]
    for idx, cat in enumerate(category_order):
        pois = by_category.get(cat, [])
        if not pois:
            continue
        poi  = rng.choice(pois)
        name = poi["name"] or poi["subcategory"].replace("_", " ").title()
        sub  = poi["subcategory"]

        # Title + description depend on category.
        if cat == "historic":
            title = f"Uncover the {name}"
            desc  = f"Seek out the {sub} known as '{name}' and mark it as discovered."
        elif cat == "tourism":
            title = f"Visit {name}"
            desc  = f"Reach the {sub} at {name} and take in the surroundings."
        else:
            title = f"Natural Wonder: {name}"
            desc  = f"Locate the {sub} '{name}' — a natural landmark worth exploring."

        diff = "medium"
        results.append(Challenge(
            id=_challenge_id(world_id, "discovery", idx),
            type="discovery",
            title=title,
            description=desc,
            difficulty=diff,
            reward_xp=_XP[diff],
            params={
                "poi_id":    poi["id"],
                "poi_name":  poi["name"],
                "category":  cat,
                "subcategory": sub,
                "target_enu": poi["enu"],
                "radius_m":  20.0,
            },
        ))

    return results


def _route_select_rules(
    world_id: str,
    rng: random.Random,
    named_features: list[dict[str, Any]],
    terrain_summary: dict[str, Any],
    east_half: float,
    north_half: float,
) -> list[Challenge]:
    """
    Route-select — travel A → B while satisfying a constraint.

    Two challenges:
      1. Cross the terrain using the "safest" path (avoid cliff/steep tiles).
      2. Complete the crossing as efficiently as possible (fewest altitude changes).
    The start and end points are derived deterministically from the terrain.
    """
    # Pick two landmarks if available; otherwise use symmetric bbox corners.
    summits = [f for f in named_features if f["type"] == "summit"]
    valleys = [f for f in named_features if f["type"] == "valley"]

    if summits and valleys:
        start_enu = valleys[0]["enu"]
        end_enu   = summits[0]["enu"]
    else:
        # Use opposite corners of the inner 60 % of the bbox.
        start_enu = [round(-east_half * 0.4, 1),  round(-north_half * 0.4, 1)]
        end_enu   = [round( east_half * 0.4, 1),  round( north_half * 0.4, 1)]

    cliff_pct = terrain_summary.get("cliff_pct", 0.0)
    steep_pct = terrain_summary.get("steep_pct", 0.0)
    diff_base = "hard" if (cliff_pct + steep_pct) > 15 else "medium"

    results = [
        Challenge(
            id=_challenge_id(world_id, "route_select", 0),
            type="route_select",
            title="Safe Passage",
            description=(
                "Travel from the start to the destination. "
                "Avoid cliff and steep-rated terrain as much as possible."
            ),
            difficulty=diff_base,
            reward_xp=_XP[diff_base],
            params={
                "start_enu":          start_enu,
                "end_enu":            end_enu,
                "constraint":         "avoid_steep_and_cliff",
                "forbidden_tiles":    ["steep", "cliff"],
            },
        ),
        Challenge(
            id=_challenge_id(world_id, "route_select", 1),
            type="route_select",
            title="Direct Line",
            description=(
                "Reach the destination by the most direct route — "
                "minimise horizontal distance travelled."
            ),
            difficulty="medium",
            reward_xp=_XP["medium"],
            params={
                "start_enu": start_enu,
                "end_enu":   end_enu,
                "constraint": "minimise_distance",
            },
        ),
    ]
    return results


def _environmental_rules(
    world_id: str,
    named_features: list[dict[str, Any]],
    terrain_summary: dict[str, Any],
    z_max: float,
) -> list[Challenge]:
    """
    Environmental — traverse the world under a terrain constraint.

    Generates up to 2 challenges:
      1. If cliff zones exist: explore without entering a cliff zone.
      2. If terrain has sufficient relief: stay below a mid-altitude ceiling.
    """
    results: list[Challenge] = []

    cliff_zones = [f for f in named_features if f["type"] == "cliff_zone"]
    cliff_pct   = terrain_summary.get("cliff_pct", 0.0)

    if cliff_zones or cliff_pct > 2:
        results.append(Challenge(
            id=_challenge_id(world_id, "environmental", 0),
            type="environmental",
            title="Walk the Edge",
            description=(
                "Explore the area and reach the summit without ever stepping "
                "onto cliff-rated terrain. One wrong turn ends the challenge."
            ),
            difficulty="extreme",
            reward_xp=_XP["extreme"],
            params={
                "forbidden_tiles": ["cliff"],
                "cliff_zone_count": len(cliff_zones),
            },
        ))

    # Altitude ceiling challenge (requires meaningful relief).
    mean_slope = terrain_summary.get("mean_slope_deg", 0.0)
    if mean_slope >= 5.0 and z_max > 0:
        ceiling = round(z_max * 0.75)
        results.append(Challenge(
            id=_challenge_id(world_id, "environmental", 1),
            type="environmental",
            title="Low Altitude Run",
            description=(
                f"Complete a full traverse of the area while staying "
                f"below {ceiling} m elevation at all times."
            ),
            difficulty="hard",
            reward_xp=_XP["hard"],
            params={
                "max_elevation_m": float(ceiling),
            },
        ))

    return results


# ── Main entry point ──────────────────────────────────────────────────────────

def generate_challenges(
    world_id: str,
    *,
    terrain_summary: dict[str, Any],
    named_features: list[dict[str, Any]],
    poi_records: list[dict[str, Any]],
    z_min: float = 0.0,
    z_max: float = 100.0,
    east_half: float = 500.0,
    north_half: float = 500.0,
    output_path: Path | str | None = None,
) -> list[dict[str, Any]]:
    """
    Generate the full challenge set for a world deterministically.

    Parameters
    ----------
    world_id : str
        16-char world id from world_compiler; used to seed the RNG.
    terrain_summary : dict
        ``TerrainFeatures.summary`` dict (slope percentages, mean/max slope).
    named_features : list[dict]
        ``TerrainFeatures.features`` list (summits, valleys, cliff_zones).
    poi_records : list[dict]
        Serialised ``PoiRecord.to_dict()`` items from poi_extractor.
    z_min, z_max : float
        Raw elevation range in metres (from TerrainMesh.z_min / z_max).
    east_half, north_half : float
        Approximate half-extents of the world grid in metres.  Used to
        place fallback waypoints when no named features exist.
    output_path : Path | str | None
        If given, write ``challenges.json`` here.

    Returns
    -------
    list[dict]
        Serialised challenges, one dict per Challenge.
    """
    rng = random.Random(int(hashlib.sha256(world_id.encode()).hexdigest(), 16))

    all_challenges: list[Challenge] = []

    all_challenges.extend(_navigation_rules(
        world_id, rng, named_features, poi_records, east_half, north_half,
    ))
    all_challenges.extend(_elevation_rules(
        world_id, rng, named_features, z_min, z_max,
    ))
    all_challenges.extend(_discovery_rules(
        world_id, rng, poi_records,
    ))
    all_challenges.extend(_route_select_rules(
        world_id, rng, named_features, terrain_summary, east_half, north_half,
    ))
    all_challenges.extend(_environmental_rules(
        world_id, named_features, terrain_summary, z_max,
    ))

    serialised = [c.to_dict() for c in all_challenges]

    if output_path is not None:
        Path(output_path).write_text(json.dumps({
            "count":      len(serialised),
            "challenges": serialised,
        }))

    return serialised
