"""
ENU (East-North-Up) local Cartesian frame anchored at a geographic centroid.

The implementation uses the standard WGS-84 ECEF ↔ ENU transformation:
  1. Geographic → ECEF  (closed-form via WGS-84 ellipsoid parameters)
  2. ECEF delta → ENU   (3×3 rotation matrix at the origin point)
  3. ENU → ECEF delta → ECEF → Geographic  (inverse path)

Round-trip error is < 0.1 m for offsets up to 1 km from the origin.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Tuple

# ── WGS-84 constants ────────────────────────────────────────────────────────
_A = 6_378_137.0          # semi-major axis (m)
_F = 1 / 298.257_223_563  # flattening
_B = _A * (1 - _F)        # semi-minor axis
_E2 = 1 - (_B / _A) ** 2  # first eccentricity squared


def _prime_vertical_radius(lat_rad: float) -> float:
    """Radius of curvature in the prime vertical N(φ)."""
    return _A / math.sqrt(1 - _E2 * math.sin(lat_rad) ** 2)


# ── ECEF helpers ─────────────────────────────────────────────────────────────

def _geo_to_ecef(lat_deg: float, lon_deg: float, alt_m: float = 0.0) -> Tuple[float, float, float]:
    """Geographic (deg, deg, m) → ECEF (m, m, m)."""
    φ = math.radians(lat_deg)
    λ = math.radians(lon_deg)
    N = _prime_vertical_radius(φ)
    x = (N + alt_m) * math.cos(φ) * math.cos(λ)
    y = (N + alt_m) * math.cos(φ) * math.sin(λ)
    z = (N * (1 - _E2) + alt_m) * math.sin(φ)
    return x, y, z


def _ecef_to_geo(x: float, y: float, z: float) -> Tuple[float, float, float]:
    """ECEF (m) → geographic (lat_deg, lon_deg, alt_m) via Bowring iteration."""
    λ = math.atan2(y, x)
    p = math.hypot(x, y)
    # Initial estimate (Bowring)
    φ = math.atan2(z, p * (1 - _E2))
    for _ in range(5):
        N = _prime_vertical_radius(φ)
        φ = math.atan2(z + _E2 * N * math.sin(φ), p)
    N = _prime_vertical_radius(φ)
    cos_φ = math.cos(φ)
    alt = (p / cos_φ - N) if abs(cos_φ) > 1e-10 else abs(z) / math.sin(φ) - N * (1 - _E2)
    return math.degrees(φ), math.degrees(λ), alt


# ── ENU rotation matrix at origin ────────────────────────────────────────────

def _enu_rotation(lat_rad: float, lon_rad: float) -> Tuple[
    Tuple[float, float, float],
    Tuple[float, float, float],
    Tuple[float, float, float],
]:
    """
    Returns rows (e_row, n_row, u_row) of the 3×3 ECEF→ENU rotation matrix
    for an origin at (lat_rad, lon_rad).
    """
    sφ, cφ = math.sin(lat_rad), math.cos(lat_rad)
    sλ, cλ = math.sin(lon_rad), math.cos(lon_rad)
    e_row = (-sλ,       cλ,      0.0)
    n_row = (-sφ * cλ, -sφ * sλ, cφ)
    u_row = ( cφ * cλ,  cφ * sλ, sφ)
    return e_row, n_row, u_row


def _dot(row: Tuple[float, float, float], v: Tuple[float, float, float]) -> float:
    return row[0] * v[0] + row[1] * v[1] + row[2] * v[2]


# ── Public API ────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ENUFrame:
    """
    Local East-North-Up Cartesian frame anchored at a geographic origin.

    All distances are in metres; altitudes default to 0 (mean sea level).
    The frame is right-handed: +X = East, +Y = North, +Z = Up.
    """

    origin_lat: float  # degrees
    origin_lon: float  # degrees
    origin_alt: float = 0.0  # metres

    def __post_init__(self) -> None:
        # Cache origin ECEF and rotation rows (frozen dataclass → use object.__setattr__)
        ox, oy, oz = _geo_to_ecef(self.origin_lat, self.origin_lon, self.origin_alt)
        object.__setattr__(self, "_ox", ox)
        object.__setattr__(self, "_oy", oy)
        object.__setattr__(self, "_oz", oz)
        φ0 = math.radians(self.origin_lat)
        λ0 = math.radians(self.origin_lon)
        e_row, n_row, u_row = _enu_rotation(φ0, λ0)
        object.__setattr__(self, "_e_row", e_row)
        object.__setattr__(self, "_n_row", n_row)
        object.__setattr__(self, "_u_row", u_row)

    # cached attributes set in __post_init__
    _ox: float = 0.0
    _oy: float = 0.0
    _oz: float = 0.0
    _e_row: Tuple[float, float, float] = (0.0, 0.0, 0.0)
    _n_row: Tuple[float, float, float] = (0.0, 0.0, 0.0)
    _u_row: Tuple[float, float, float] = (0.0, 0.0, 0.0)

    def latlon_to_enu(
        self,
        lat: float,
        lon: float,
        alt: float = 0.0,
    ) -> Tuple[float, float, float]:
        """Convert geographic coordinates to local ENU metres."""
        px, py, pz = _geo_to_ecef(lat, lon, alt)
        dx, dy, dz = px - self._ox, py - self._oy, pz - self._oz
        v = (dx, dy, dz)
        return _dot(self._e_row, v), _dot(self._n_row, v), _dot(self._u_row, v)

    def enu_to_latlon(
        self,
        east: float,
        north: float,
        up: float = 0.0,
    ) -> Tuple[float, float, float]:
        """Convert local ENU metres back to geographic coordinates."""
        # Inverse rotation: R^T applied to ENU vector gives ECEF delta.
        er, nr, ur = self._e_row, self._n_row, self._u_row
        dx = er[0] * east + nr[0] * north + ur[0] * up
        dy = er[1] * east + nr[1] * north + ur[1] * up
        dz = er[2] * east + nr[2] * north + ur[2] * up
        return _ecef_to_geo(self._ox + dx, self._oy + dy, self._oz + dz)


# ── Module-level convenience functions ───────────────────────────────────────

def latlon_to_enu(
    lat: float,
    lon: float,
    origin_lat: float,
    origin_lon: float,
    alt: float = 0.0,
    origin_alt: float = 0.0,
) -> Tuple[float, float, float]:
    """One-shot conversion: geographic → ENU relative to the given origin."""
    return ENUFrame(origin_lat, origin_lon, origin_alt).latlon_to_enu(lat, lon, alt)


def enu_to_latlon(
    east: float,
    north: float,
    origin_lat: float,
    origin_lon: float,
    up: float = 0.0,
    origin_alt: float = 0.0,
) -> Tuple[float, float, float]:
    """One-shot conversion: ENU → geographic relative to the given origin."""
    return ENUFrame(origin_lat, origin_lon, origin_alt).enu_to_latlon(east, north, up)
