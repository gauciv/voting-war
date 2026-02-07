"""
WebSocket connection manager.

Handles:
  - Accepting / removing client connections
  - Broadcasting scores to ALL connected clients simultaneously
  - A background loop that pushes the latest scores every N seconds
    so every browser tab stays in sync regardless of who voted.
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import WebSocket

logger = logging.getLogger("voting-war.ws")


class ConnectionManager:
    """Manages active WebSocket connections and broadcasts."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    @property
    def count(self) -> int:
        return len(self._connections)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)
        logger.info("WS connected  — %d active", self.count)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(ws)
        logger.info("WS disconnected — %d active", self.count)

    async def broadcast(self, scores: dict) -> None:
        """Send scores JSON to every connected client, drop dead ones."""
        payload = json.dumps(scores)
        dead: list[WebSocket] = []

        async with self._lock:
            clients = list(self._connections)

        for ws in clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    self._connections.discard(ws)
            logger.debug("Dropped %d dead WS connections", len(dead))

    async def broadcast_loop(self, interval: float, get_state) -> None:
        """
        Background task — continuously pushes fresh match state to all clients.
        `get_state` is an async callable returning the full match state dict.
        """
        while True:
            try:
                if self.count > 0:
                    state = await get_state()
                    await self.broadcast(state)
            except Exception:
                logger.exception("Error in broadcast loop")
            await asyncio.sleep(interval)


manager = ConnectionManager()
