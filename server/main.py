"""
Voting War — Backend Entry Point

FastAPI application with:
  - REST API for scores & voting
  - WebSocket for real-time broadcasting
  - Server-authoritative match state (win at 100, auto-reset)
  - DynamoDB with automatic local fallback

Run:
    python main.py
    # or
    uvicorn main:app --host 0.0.0.0 --port 3000 --reload
"""

from __future__ import annotations

import asyncio
import logging

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routes import router
from db import get_store
from ws import manager
from match import match_manager

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-22s │ %(levelname)-7s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("voting-war")


# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown hooks."""

    # ── Startup ──
    store = get_store()
    store_name = type(store).__name__
    logger.info("Database  : %s", store_name)
    logger.info("CORS      : %s", settings.CORS_ORIGINS)
    logger.info("Win score : %d", settings.WIN_SCORE)

    # Start the background broadcast loop — pushes full match state
    broadcast_task = asyncio.create_task(
        manager.broadcast_loop(
            interval=settings.WS_BROADCAST_INTERVAL,
            get_state=match_manager.get_full_state,
        )
    )
    logger.info("✅  Voting War server ready on %s:%d", settings.HOST, settings.PORT)

    yield

    # ── Shutdown ──
    broadcast_task.cancel()
    try:
        await broadcast_task
    except asyncio.CancelledError:
        pass
    logger.info("Server shut down cleanly")


# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Voting War API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the S3-hosted frontend to talk to this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
app.include_router(router)


# ── Direct execution ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
        log_level="info",
    )
