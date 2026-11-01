/**
 * Client for quest validation API (backend).
 * Communicates with POST /quests/:id/complete to validate and reward quest completion.
 */

export interface PlayerEvent {
  type: 'position_reached' | 'item_collected' | 'landmark_discovered';
  timestamp: number;
  data: Record<string, unknown>;
}

export interface QuestCompletionRequest {
  world_id: string;
  quest_id: string;
  player_id: string;
  events: PlayerEvent[];
  final_position: { x: number; y: number; z: number };
}

export interface RewardData {
  xp: number;
  items: string[];
}

export interface QuestCompletionResponse {
  success: boolean;
  quest_id: string;
  message: string;
  reward: RewardData | null;
}

export class QuestApiClient {
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:8000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Submit quest completion for validation and reward.
   * Server verifies events satisfy objective before awarding XP.
   */
  async completeQuest(request: QuestCompletionRequest): Promise<QuestCompletionResponse> {
    const url = `${this.baseUrl}/quests/${encodeURIComponent(request.quest_id)}/complete`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      throw new Error(`Quest validation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Check if a quest has already been completed.
   */
  async getQuestStatus(
    world_id: string,
    quest_id: string,
    player_id: string,
  ): Promise<{ quest_id: string; completed: boolean; completion_timestamp: number | null }> {
    const url = new URL(`${this.baseUrl}/quests/${encodeURIComponent(quest_id)}/status`);
    url.searchParams.set('world_id', world_id);
    url.searchParams.set('player_id', player_id);

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      throw new Error(`Failed to check quest status: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
