"""
Application configuration.

Only deployment-critical values come from env vars (keys, endpoints).
Everything else uses sensible hardcoded defaults.
"""

from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the server directory
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)


class Settings:
    # ── Hardcoded defaults (not in .env) ─────────────────────────────────
    HOST: str = "0.0.0.0"
    PORT: int = 3000
    WS_BROADCAST_INTERVAL: float = 0.5

    # Match rules
    WIN_SCORE: int = 100            # first team to this score wins
    COUNTDOWN_SECONDS: int = 8      # seconds before auto-reset after a win

    # ── Deployment-critical (from .env) ──────────────────────────────────
    CORS_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://localhost:5174"
        ).split(",")
    ]

    # DynamoDB — if keys are set, we use DynamoDB; otherwise LocalStore
    AWS_REGION: str = os.getenv("AWS_REGION", "ap-southeast-1")
    DYNAMODB_TABLE_NAME: str = os.getenv("DYNAMODB_TABLE_NAME", "voting-war-scores")
    AWS_ACCESS_KEY_ID: str | None = os.getenv("AWS_ACCESS_KEY_ID") or None
    AWS_SECRET_ACCESS_KEY: str | None = os.getenv("AWS_SECRET_ACCESS_KEY") or None

    @property
    def DB_MODE(self) -> str:
        """Auto-detect: if AWS keys are set → dynamodb, otherwise → local."""
        if self.AWS_ACCESS_KEY_ID and self.AWS_SECRET_ACCESS_KEY:
            return "dynamodb"
        return "local"


settings = Settings()
