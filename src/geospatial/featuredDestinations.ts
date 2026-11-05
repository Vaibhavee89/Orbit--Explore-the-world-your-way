import type { BoundingBox } from './types';

export interface FeaturedDestination {
  id: string;
  name: string;
  tagline: string;
  lat: number;
  lon: number;
  box: BoundingBox;
}

/**
 * Curated set of pre-built destinations. Each bbox is pre-warmed on the
 * backend (same bbox → same cached world directory), so selecting one of
 * these builds instantly instead of waiting on fresh OSM/elevation fetches.
 */
export const FEATURED_DESTINATIONS: FeaturedDestination[] = [
  {
    id: 'manali',
    name: 'Manali',
    tagline: 'Mountain Expedition',
    lat: 32.2432,
    lon: 77.1892,
    box: {
      west: 77.186545, south: 32.240954, east: 77.191855, north: 32.245446,
      widthM: 500, heightM: 500,
    },
  },
  {
    id: 'kyoto',
    name: 'Kyoto',
    tagline: 'Cultural Exploration',
    lat: 35.0037,
    lon: 135.7788,
    box: {
      west: 135.776058, south: 35.001454, east: 135.781542, north: 35.005946,
      widthM: 500, heightM: 500,
    },
  },
  {
    id: 'iceland',
    name: 'Iceland',
    tagline: 'Arctic Discovery',
    lat: 64.0784,
    lon: -16.2302,
    box: {
      west: -16.235337, south: 64.076154, east: -16.225063, north: 64.080646,
      widthM: 500, heightM: 500,
    },
  },
  {
    id: 'swiss-alps',
    name: 'Swiss Alps',
    tagline: 'Alpine Adventure',
    lat: 45.9763,
    lon: 7.6586,
    box: {
      west: 7.655368, south: 45.974054, east: 7.661832, north: 45.978546,
      widthM: 500, heightM: 500,
    },
  },
  {
    id: 'rajasthan',
    name: 'Rajasthan',
    tagline: 'Desert Expedition',
    lat: 26.9070,
    lon: 70.6183,
    box: {
      west: 70.615782, south: 26.904754, east: 70.620818, north: 26.909246,
      widthM: 500, heightM: 500,
    },
  },
];
