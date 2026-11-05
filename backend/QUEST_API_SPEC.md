# Quest Validation API Specification

## Overview

The Quest Validation API handles server-side verification of quest completion claims from the client. Before awarding XP and items, the server validates that reported player events satisfy the quest objective.

## Architecture

```
Client (Game)
  ↓
  quest completion claim + event log
  ↓
QuestApiClient (frontend)
  ↓ POST /quests/{quest_id}/complete
Backend (FastAPI)
  ↓
QuestValidator
  ├─ Load quest definition from world manifest
  ├─ Validate events against objective
  └─ Award XP/items if valid
```

## Endpoints

### POST /quests/{quest_id}/complete

**Validate and complete a quest.**

#### Request

```json
{
  "world_id": "550e8400-e29b-41d4-a716-446655440000",
  "quest_id": "quest_reach_viewpoint_1",
  "player_id": "player_abc123",
  "events": [
    {
      "type": "position_reached",
      "timestamp": 1704067200000,
      "data": {
        "x": 250,
        "y": 10,
        "z": 180,
        "distance_from_target": 2.5
      }
    },
    {
      "type": "item_collected",
      "timestamp": 1704067205000,
      "data": {
        "item_id": "scenic_photo_1",
        "location": { "x": 260, "y": 5, "z": 190 }
      }
    }
  ],
  "final_position": {
    "x": 250,
    "y": 10,
    "z": 180
  }
}
```

#### Response (Success)

```json
{
  "success": true,
  "quest_id": "quest_reach_viewpoint_1",
  "message": "Quest completed! Awarded 50 XP.",
  "reward": {
    "xp": 50,
    "items": ["scenic_photo_1"]
  }
}
```

#### Response (Already Completed)

```json
{
  "success": false,
  "quest_id": "quest_reach_viewpoint_1",
  "message": "Quest already completed. Reward already granted.",
  "reward": null
}
```

#### HTTP Status Codes

- `200 OK` — Quest validated successfully
- `400 Bad Request` — Invalid request (missing events, etc.)
- `404 Not Found` — Quest not found (optional; can also 200 with success=false)
- `500 Internal Server Error` — Validation error

### GET /quests/{quest_id}/status

**Check if a quest has been completed.**

#### Query Parameters

- `world_id` (string, required) — World ID
- `player_id` (string, required) — Player ID

#### Response

```json
{
  "quest_id": "quest_reach_viewpoint_1",
  "completed": true,
  "completion_timestamp": 1704067210000
}
```

## Validation Logic (To Implement)

### Objective Types

Each quest has an objective type that determines what events are valid:

#### `reach` — Player must reach a location

```python
objective = {
  "type": "reach",
  "target": { "x": 250, "y": 10, "z": 180 },
  "radius_m": 5.0
}

# Validate: events contain position_reached within radius of target
```

#### `collect` — Player must collect specific items

```python
objective = {
  "type": "collect",
  "required_items": ["scenic_photo_1", "journal_entry_2"]
}

# Validate: events contain item_collected for each required item
```

#### `discover` — Player must discover landmarks/zones

```python
objective = {
  "type": "discover",
  "required_landmarks": ["viewpoint_1", "historic_site_2"]
}

# Validate: events contain landmark_discovered for each required landmark
```

### Fraud Detection (Optional)

- **Time validation:** All event timestamps must be > quest start time and < claim time
- **Distance validation:** Movement distances must be physically plausible (no teleporting)
- **Ordering:** Events must be in chronological order
- **Duplicate detection:** Same item can't be collected twice in one quest

## Models

### PlayerEvent

```typescript
interface PlayerEvent {
  type: 'position_reached' | 'item_collected' | 'landmark_discovered';
  timestamp: number; // Unix milliseconds
  data: Record<string, unknown>; // Type-specific payload
}
```

### QuestCompletionRequest

```typescript
interface QuestCompletionRequest {
  world_id: string;
  quest_id: string;
  player_id: string;
  events: PlayerEvent[];
  final_position: { x: number; y: number; z: number };
}
```

### RewardData

```typescript
interface RewardData {
  xp: number;
  items: string[];
}
```

## Integration with Frontend

### Usage Example

```typescript
import { QuestApiClient, type QuestCompletionRequest } from '@/game/quest';

const client = new QuestApiClient('http://localhost:8000');

const request: QuestCompletionRequest = {
  world_id: manifest.id,
  quest_id: quest.id,
  player_id: playerId,
  events: [
    {
      type: 'position_reached',
      timestamp: Date.now(),
      data: { x: player.x, y: player.y, z: player.z }
    }
  ],
  final_position: { x: player.x, y: player.y, z: player.z }
};

const result = await client.completeQuest(request);
if (result.success && result.reward) {
  xpManager.addXp(result.reward.xp);
  inventory.add(...result.reward.items);
}
```

## TODO (P5-08)

- [ ] Load quest definition from world manifest
- [ ] Implement objective validators (reach, collect, discover)
- [ ] Add fraud detection (time, distance, ordering)
- [ ] Persist completions to database (Phase 6)
- [ ] Add quest completion logging
- [ ] Rate limiting on quest completion endpoints
