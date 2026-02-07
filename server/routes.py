"""
API routes — mounted under /api in main.py.

Endpoints:
  GET  /api/scores      → current match state (scores + match info)
  POST /api/vote        → increment a team + broadcast via WS
  GET  /api/health      → health check for load balancers / monitoring
  WS   /api/ws          → real-time match state stream
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel, field_validator

from ws import manager
from match import match_manager

logger = logging.getLogger("voting-war.routes")
router = APIRouter(prefix="/api")


# ── Request / Response models ────────────────────────────────────────────────

class VoteRequest(BaseModel):
    team: str

    @field_validator("team")
    @classmethod
    def validate_team(cls, v: str) -> str:
        if v not in ("team1", "team2"):
            raise ValueError("team must be 'team1' or 'team2'")
        return v


# ── REST endpoints ───────────────────────────────────────────────────────────

@router.get("/scores")
async def get_scores():
    """Return current match state including scores, winner, countdown, etc."""
    try:
        return await match_manager.get_full_state()
    except Exception:
        logger.exception("Failed to get scores")
        raise HTTPException(status_code=500, detail="Failed to retrieve scores")


@router.post("/vote")
async def vote(body: VoteRequest):
    """Increment a team's score. Rejected if match is not active."""
    try:
        state = await match_manager.handle_vote(body.team)

        # Broadcast updated state to all WS clients instantly
        await manager.broadcast(state)

        return state
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("Failed to register vote")
        raise HTTPException(status_code=500, detail="Failed to register vote")


@router.get("/health")
async def health_check():
    """Lightweight health probe for ALB / monitoring."""
    from db import get_store
    store = get_store()
    db_type = type(store).__name__
    return {
        "status": "ok",
        "db": db_type,
        "ws_clients": manager.count,
    }


# ── WebSocket endpoint ──────────────────────────────────────────────────────

@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    Real-time match state stream.
    On connect → send current full state immediately.
    Stays open — the broadcast loop pushes updates.
    """
    await manager.connect(ws)
    try:
        # Send current state right away so the client doesn't wait
        state = await match_manager.get_full_state()
        await ws.send_json(state)

        # Keep the connection alive — listen for client messages
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("WS connection error")
    finally:
        await manager.disconnect(ws)
