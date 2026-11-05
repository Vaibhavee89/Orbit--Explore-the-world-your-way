"""
FastAPI router for quest completion validation and reward processing.

Routes:
  POST /quests/{quest_id}/complete  — validate quest completion; award XP/items
  GET  /quests/{quest_id}/status    — check if quest is completed

Quest Validator:
  - Accepts client-reported event log (position, items collected, time)
  - Verifies events satisfy the quest objective
  - Awards XP and items on validation
  - Prevents duplicate rewards
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/quests", tags=["quests"])


# ── Models ────────────────────────────────────────────────────────────────────

class PlayerEvent(BaseModel):
    """Event reported by the player during quest progress."""
    type: str  # "position_reached", "item_collected", "landmark_discovered"
    timestamp: int  # Unix ms
    data: dict  # Type-specific payload


class QuestCompletionRequest(BaseModel):
    """Client submits events and claims quest completion."""
    world_id: str
    quest_id: str
    player_id: str
    events: list[PlayerEvent]
    final_position: dict = Field(default_factory=dict)  # {"x": float, "y": float, "z": float}


class RewardData(BaseModel):
    """Reward granted on quest completion."""
    xp: int
    items: list[str] = Field(default_factory=list)


class QuestCompletionResponse(BaseModel):
    """Response after quest validation."""
    success: bool
    quest_id: str
    message: str
    reward: Optional[RewardData] = None


class QuestStatusResponse(BaseModel):
    """Status of a quest."""
    quest_id: str
    completed: bool
    completion_timestamp: Optional[int] = None


# ── In-memory completion tracking (Phase 6: persist to DB) ────────────────────

_quest_completions: dict[tuple[str, str, str], dict] = {}
"""Map of (world_id, quest_id, player_id) → completion data."""


# ── POST /quests/{quest_id}/complete ──────────────────────────────────────────

@router.post("/{quest_id}/complete", response_model=QuestCompletionResponse)
async def complete_quest(quest_id: str, body: QuestCompletionRequest) -> QuestCompletionResponse:
    """
    Validate quest completion and award rewards.

    Validation steps:
      1. Check quest hasn't been completed already
      2. Verify reported events satisfy quest objective
      3. Award XP and items
      4. Record completion

    TODO (P5-08):
      - Load quest definition from world manifest
      - Validate events against objective (distance, item IDs, etc.)
      - Return XP amount from quest definition
      - Prevent reward duplication via player_id + quest_id
    """
    completion_key = (body.world_id, quest_id, body.player_id)

    # Check if already completed
    if completion_key in _quest_completions:
        return QuestCompletionResponse(
            success=False,
            quest_id=quest_id,
            message="Quest already completed. Reward already granted.",
            reward=None,
        )

    # TODO: Validate events against quest objective
    # For now, accept any completion with at least one event
    if not body.events:
        raise HTTPException(
            status_code=400,
            detail="Quest completion requires at least one event.",
        )

    # TODO: Load quest from world manifest to get actual XP
    # Placeholder: award XP based on quest type
    xp_reward = 50  # Placeholder
    items_reward = []

    # Record completion
    _quest_completions[completion_key] = {
        "timestamp": body.events[-1].timestamp if body.events else 0,
        "events": [e.dict() for e in body.events],
        "xp": xp_reward,
        "items": items_reward,
    }

    return QuestCompletionResponse(
        success=True,
        quest_id=quest_id,
        message=f"Quest completed! Awarded {xp_reward} XP.",
        reward=RewardData(xp=xp_reward, items=items_reward),
    )


# ── GET /quests/{quest_id}/status ────────────────────────────────────────────

@router.get("/{quest_id}/status", response_model=QuestStatusResponse)
async def get_quest_status(quest_id: str, world_id: str, player_id: str) -> QuestStatusResponse:
    """Check if a quest has been completed by a player."""
    completion_key = (world_id, quest_id, player_id)
    completion = _quest_completions.get(completion_key)

    return QuestStatusResponse(
        quest_id=quest_id,
        completed=completion is not None,
        completion_timestamp=completion["timestamp"] if completion else None,
    )
