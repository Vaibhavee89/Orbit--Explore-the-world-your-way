"""
Unit tests for app.world_builder.coordinate_system.

Ground truth: pyproj Transformer (WGS-84 geographic ↔ ECEF) plus manual
ENU rotation — gives an independent implementation for comparison.
Round-trip accuracy requirement: < 0.5 m within a 1 km region.
"""

import math
import pytest
from pyproj import Transformer

from app.world_builder.coordinate_system import ENUFrame, latlon_to_enu, enu_to_latlon

# ── Manali, Himachal Pradesh (P1-02 acceptance location) ────────────────────
ORIGIN_LAT = 32.2432
ORIGIN_LON = 77.1892

# ── pyproj ground-truth helpers ──────────────────────────────────────────────
_TO_ECEF = Transformer.from_crs("EPSG:4326", "EPSG:4978", always_xy=False)
_FROM_ECEF = Transformer.from_crs("EPSG:4978", "EPSG:4326", always_xy=False)


def _pyproj_latlon_to_enu(lat, lon, o_lat, o_lon, alt=0.0, o_alt=0.0):
    """Reference ENU via pyproj ECEF + manual rotation matrix."""
    ox, oy, oz = _TO_ECEF.transform(o_lat, o_lon, o_alt)
    px, py, pz = _TO_ECEF.transform(lat, lon, alt)
    dx, dy, dz = px - ox, py - oy, pz - oz

    φ = math.radians(o_lat)
    λ = math.radians(o_lon)
    sφ, cφ, sλ, cλ = math.sin(φ), math.cos(φ), math.sin(λ), math.cos(λ)

    e = -sλ * dx + cλ * dy
    n = -sφ * cλ * dx - sφ * sλ * dy + cφ * dz
    u = cφ * cλ * dx + cφ * sλ * dy + sφ * dz
    return e, n, u


def _haversine_m(lat1, lon1, lat2, lon2):
    """Great-circle distance in metres (used to measure round-trip error)."""
    R = 6_371_000
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ── Tests ────────────────────────────────────────────────────────────────────

class TestENUFrameBasics:

    def test_origin_maps_to_zero(self):
        frame = ENUFrame(ORIGIN_LAT, ORIGIN_LON)
        e, n, u = frame.latlon_to_enu(ORIGIN_LAT, ORIGIN_LON)
        assert abs(e) < 0.01 and abs(n) < 0.01 and abs(u) < 0.01

    def test_north_offset(self):
        """250 m north → N ≈ 250, E ≈ 0.

        We derive the exact target lat from the inverse (enu_to_latlon) so the
        test does not depend on a flat-earth degree approximation that differs
        from the ellipsoidal meridional radius at latitude 32°.
        """
        frame = ENUFrame(ORIGIN_LAT, ORIGIN_LON)
        target_lat, target_lon, _ = frame.enu_to_latlon(0, 250)
        e, n, u = frame.latlon_to_enu(target_lat, target_lon)
        assert abs(n - 250) < 0.5, f"N error: {abs(n - 250):.3f} m"
        assert abs(e) < 0.5,       f"E leak:  {abs(e):.3f} m"

    def test_east_offset(self):
        """250 m east → E ≈ 250, N ≈ 0.

        Same strategy: derive exact target lon from the inverse.
        """
        frame = ENUFrame(ORIGIN_LAT, ORIGIN_LON)
        target_lat, target_lon, _ = frame.enu_to_latlon(250, 0)
        e, n, u = frame.latlon_to_enu(target_lat, target_lon)
        assert abs(e - 250) < 0.5, f"E error: {abs(e - 250):.3f} m"
        assert abs(n) < 0.5,       f"N leak:  {abs(n):.3f} m"


class TestRoundTrip:

    @pytest.mark.parametrize("east,north", [
        (0, 0),
        (250, 0),
        (0, 250),
        (250, 250),
        (-250, 150),
        (499, 499),   # near 500 m boundary
        (-499, -499),
        (0, -499),
    ])
    def test_round_trip_within_500m(self, east, north):
        """latlon_to_enu ∘ enu_to_latlon round-trip < 0.5 m."""
        frame = ENUFrame(ORIGIN_LAT, ORIGIN_LON)
        lat, lon, alt = frame.enu_to_latlon(east, north)
        e2, n2, _ = frame.latlon_to_enu(lat, lon, alt)
        err = math.hypot(e2 - east, n2 - north)
        assert err < 0.5, f"Round-trip error {err:.4f} m for ENU ({east},{north})"

    def test_round_trip_at_1km_corners(self):
        """< 0.5 m even at the corners of a 1 km × 1 km box."""
        frame = ENUFrame(ORIGIN_LAT, ORIGIN_LON)
        for e0, n0 in [(500, 500), (-500, 500), (500, -500), (-500, -500)]:
            lat, lon, _ = frame.enu_to_latlon(e0, n0)
            e2, n2, _ = frame.latlon_to_enu(lat, lon)
            err = math.hypot(e2 - e0, n2 - n0)
            assert err < 0.5, f"1 km corner ({e0},{n0}): error {err:.4f} m"


class TestAgainstPyproj:

    @pytest.mark.parametrize("dlat,dlon", [
        (0.001, 0),
        (0, 0.001),
        (0.002, 0.002),
        (-0.001, 0.001),
        (0.004, -0.003),  # ~500 m N, ~300 m W
    ])
    def test_matches_pyproj_reference(self, dlat, dlon):
        """Our ENU must agree with the pyproj reference within 0.1 m."""
        lat, lon = ORIGIN_LAT + dlat, ORIGIN_LON + dlon
        e_ref, n_ref, u_ref = _pyproj_latlon_to_enu(lat, lon, ORIGIN_LAT, ORIGIN_LON)
        e_our, n_our, u_our = latlon_to_enu(lat, lon, ORIGIN_LAT, ORIGIN_LON)
        assert abs(e_our - e_ref) < 0.1, f"E diff {abs(e_our - e_ref):.4f} m"
        assert abs(n_our - n_ref) < 0.1, f"N diff {abs(n_our - n_ref):.4f} m"
        assert abs(u_our - u_ref) < 0.1, f"U diff {abs(u_our - u_ref):.4f} m"


class TestModuleFunctions:

    def test_latlon_to_enu_convenience(self):
        frame = ENUFrame(ORIGIN_LAT, ORIGIN_LON)
        e1, n1, u1 = frame.latlon_to_enu(ORIGIN_LAT + 0.001, ORIGIN_LON)
        e2, n2, u2 = latlon_to_enu(ORIGIN_LAT + 0.001, ORIGIN_LON, ORIGIN_LAT, ORIGIN_LON)
        assert abs(e1 - e2) < 1e-6 and abs(n1 - n2) < 1e-6

    def test_enu_to_latlon_convenience(self):
        frame = ENUFrame(ORIGIN_LAT, ORIGIN_LON)
        r1 = frame.enu_to_latlon(100, 200)
        r2 = enu_to_latlon(100, 200, ORIGIN_LAT, ORIGIN_LON)
        assert abs(r1[0] - r2[0]) < 1e-9 and abs(r1[1] - r2[1]) < 1e-9

    def test_altitude_passthrough(self):
        """Up component should reflect altitude offset."""
        frame = ENUFrame(ORIGIN_LAT, ORIGIN_LON, origin_alt=0.0)
        _, _, u = frame.latlon_to_enu(ORIGIN_LAT, ORIGIN_LON, alt=100.0)
        assert abs(u - 100.0) < 0.1

    def test_inverse_at_various_latitudes(self):
        """Round-trip holds at different global latitudes (not just Manali)."""
        for lat0, lon0 in [(0, 0), (51.5, -0.1), (-33.9, 151.2), (64.1, -21.9)]:
            frame = ENUFrame(lat0, lon0)
            lat, lon, _ = frame.enu_to_latlon(300, 300)
            e, n, _ = frame.latlon_to_enu(lat, lon)
            err = math.hypot(e - 300, n - 300)
            assert err < 0.5, f"Lat {lat0}: round-trip error {err:.4f} m"
