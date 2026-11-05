export { WorldLoader } from './WorldLoader';
export type { WorldAssets } from './WorldLoader';
export { BuildingLoader } from './BuildingLoader';
export { RoadLoader } from './RoadLoader';
export { WorldRegistry } from './WorldRegistry';
export type { WorldRegistryEntry, EnvironmentType } from './WorldRegistry';
export type { LocalWorldDefinition, TerrainConfig, PropPlacement, PropKind } from './LocalWorldDefinition';
export { LocalWorldLoader } from './LocalWorldLoader';
export type { LocalWorldLoadResult } from './LocalWorldLoader';
export { generateProceduralTerrain } from './ProceduralTerrain';
export { MANALI_WORLD } from './manali.world';
export { RAJASTHAN_WORLD } from './rajasthan.world';
export { ICELAND_WORLD } from './iceland.world';
export { KYOTO_WORLD } from './kyoto.world';
export { SWISS_ALPS_WORLD } from './swissalps.world';

import { WorldRegistry } from './WorldRegistry';
import { MANALI_WORLD } from './manali.world';
import { RAJASTHAN_WORLD } from './rajasthan.world';
import { ICELAND_WORLD } from './iceland.world';
import { KYOTO_WORLD } from './kyoto.world';
import { SWISS_ALPS_WORLD } from './swissalps.world';

// Register built-in local worlds on module load.
WorldRegistry.register({
  id: 'manali',
  name: 'Manali',
  tagline: 'Mountain Expedition',
  environment: 'mountain',
  description: 'A hand-authored Himalayan valley village, ringed by pine forest and snow-capped peaks.',
  source: 'local',
  local: MANALI_WORLD,
});

WorldRegistry.register({
  id: 'rajasthan',
  name: 'Rajasthan',
  tagline: 'Desert Expedition',
  environment: 'desert',
  description: 'A hand-authored "Lost Kingdom" — rolling dunes, a sandstone fortress, a desert village, and a forgotten oasis.',
  source: 'local',
  local: RAJASTHAN_WORLD,
});

WorldRegistry.register({
  id: 'iceland',
  name: 'Iceland',
  tagline: 'Arctic Discovery',
  environment: 'arctic',
  description: 'A hand-authored "Frozen Frontier" — a Nordic coastal village, basalt coastline, a great waterfall, and a glacier valley.',
  source: 'local',
  local: ICELAND_WORLD,
});

WorldRegistry.register({
  id: 'kyoto',
  name: 'Kyoto',
  tagline: 'Cultural Exploration',
  environment: 'cultural',
  description: 'A hand-authored "Forgotten Traditions" — a traditional village street, a pagoda temple, a bamboo forest, and cherry blossom gardens.',
  source: 'local',
  local: KYOTO_WORLD,
});

WorldRegistry.register({
  id: 'swiss-alps',
  name: 'Swiss Alps',
  tagline: 'Alpine Adventure',
  environment: 'mountain',
  description: 'A hand-authored "Beyond the Summit" — a chalet village, green meadows, a turquoise lake, and a high mountain trail to the summit.',
  source: 'local',
  local: SWISS_ALPS_WORLD,
});
