"""
Match state machine — server-authoritative match lifecycle.

States:
  active    → players can vote, first to WIN_SCORE triggers victory
  victory   → winner displayed, countdown starts
  countdown → timer ticking down, auto-resets to a new match

All connected clients receive the full match state via WebSocket,
so every browser shows the exact same thing.
"""

from __future__ import annotations

import asyncio
import logging
import time

from config import settings
from db import get_store

logger = logging.getLogger("voting-war.match")


class MatchManager:
    """Server-authoritative match state — singleton."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._state: str = "active"          # "active" | "victory" | "countdown"
        self._winner: str | None = None       # "team1" | "team2" | None
        self._matches_played: int = 0
        self._countdown_end: float | None = None
        self._countdown_task: asyncio.Task | None = None

    # ── Public getters ───────────────────────────────────────────────────

    async def get_full_state(self) -> dict:
        """Return the full match state for WS broadcast."""
        store = get_store()
        scores = await store.get_scores()

        async with self._lock:
            state = {
                "team1": scores["team1"],
                "team2": scores["team2"],
                "matchState": self._state,
                "winner": self._winner,
                "matchesPlayed": self._matches_played,
                "countdown": self._get_countdown_remaining(),
                "winScore": settings.WIN_SCORE,
            }
        return state

    def _get_countdown_remaining(self) -> int:
        """Seconds remaining in countdown, or 0."""
        if self._countdown_end is None:
            return 0
        remaining = self._countdown_end - time.time()
        return max(0, int(remaining + 0.5))  # round up

    # ── Vote handling ────────────────────────────────────────────────────

    async def handle_vote(self, team: str) -> dict:
        """
        Process a vote. If the match is not active, reject it.
        If the vote causes a win, transition to victory state.
        Returns the full match state.

        The entire check → increment → win-check sequence is held
        under a single lock acquisition to prevent TOCTOU races
        (e.g. score overshooting WIN_SCORE when two votes land
        at the exact same moment).
        """
        async with self._lock:
            if self._state != "active":
                # Match is over or resetting — ignore votes
                return await self._unlocked_full_state()

            # Increment score in the store (still under lock)
            store = get_store()
            scores = await store.increment(team)

            # Check win condition
            if scores.get("team1", 0) >= settings.WIN_SCORE or scores.get("team2", 0) >= settings.WIN_SCORE:
                self._state = "victory"
                self._winner = "team1" if scores["team1"] >= settings.WIN_SCORE else "team2"
                logger.info(
                    "🏆 %s wins! (team1=%d, team2=%d) — match #%d",
                    self._winner, scores["team1"], scores["team2"],
                    self._matches_played + 1,
                )
                # Start countdown in background
                self._start_countdown()

        return await self.get_full_state()

    # ── Countdown / Reset ────────────────────────────────────────────────

    def _start_countdown(self) -> None:
        """Begin the post-victory countdown (called while holding lock)."""
        self._state = "countdown"
        self._countdown_end = time.time() + settings.COUNTDOWN_SECONDS
        self._countdown_task = asyncio.create_task(self._countdown_loop())

    async def _countdown_loop(self) -> None:
        """Wait for countdown to expire, then auto-reset."""
        try:
            await asyncio.sleep(settings.COUNTDOWN_SECONDS)
            await self._reset_match()
        except asyncio.CancelledError:
            pass

    async def _reset_match(self) -> None:
        """Reset scores and start a new match."""
        store = get_store()
        await store.reset()

        async with self._lock:
            self._matches_played += 1
            self._state = "active"
            self._winner = None
            self._countdown_end = None
            self._countdown_task = None

        logger.info("🔄 Match reset — starting match #%d", self._matches_played + 1)

        # Broadcast the fresh state immediately
        from ws import manager
        state = await self.get_full_state()
        await manager.broadcast(state)

    async def _unlocked_full_state(self) -> dict:
        """Get full state when we already hold the lock (for internal use)."""
        store = get_store()
        scores = await store.get_scores()
        return {
            "team1": scores["team1"],
            "team2": scores["team2"],
            "matchState": self._state,
            "winner": self._winner,
            "matchesPlayed": self._matches_played,
            "countdown": self._get_countdown_remaining(),
            "winScore": settings.WIN_SCORE,
        }


# Singleton
match_manager = MatchManager()
