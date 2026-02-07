"""
Database abstraction layer.

Provides a unified interface with two backends:
  - DynamoDBStore  : AWS DynamoDB with atomic counters (production)
  - LocalStore     : Thread-safe in-memory dict (development / fallback)

The factory `get_store()` picks the right one based on DB_MODE.
"""

from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod

logger = logging.getLogger("voting-war.db")


# ── Abstract base ────────────────────────────────────────────────────────────

class ScoreStore(ABC):
    """Interface every store must implement."""

    @abstractmethod
    async def get_scores(self) -> dict:
        """Return {"team1": int, "team2": int}."""
        ...

    @abstractmethod
    async def increment(self, team: str) -> dict:
        """Atomically increment `team` and return updated scores."""
        ...

    @abstractmethod
    async def reset(self) -> dict:
        """Reset both scores to 0 and return {"team1": 0, "team2": 0}."""
        ...


# ── In-memory fallback ──────────────────────────────────────────────────────

class LocalStore(ScoreStore):
    """Thread-safe in-memory store — data is lost on restart."""

    def __init__(self) -> None:
        self._scores = {"team1": 0, "team2": 0}
        self._lock = asyncio.Lock()
        logger.info("LocalStore initialised (in-memory, non-persistent)")

    async def get_scores(self) -> dict:
        async with self._lock:
            return dict(self._scores)

    async def increment(self, team: str) -> dict:
        if team not in ("team1", "team2"):
            raise ValueError(f"Invalid team: {team}")
        async with self._lock:
            self._scores[team] += 1
            return dict(self._scores)

    async def reset(self) -> dict:
        async with self._lock:
            self._scores = {"team1": 0, "team2": 0}
            return dict(self._scores)


# ── DynamoDB store ───────────────────────────────────────────────────────────

class DynamoDBStore(ScoreStore):
    """
    Stores scores in a single DynamoDB item using atomic ADD operations.

    Table schema:
      PK = "match" (S)  — partition key, always "current"
      team1 (N)
      team2 (N)
    """

    def __init__(self, table_name: str, region: str,
                 aws_key: str | None = None,
                 aws_secret: str | None = None) -> None:
        import boto3
        from botocore.config import Config as BotoConfig

        kwargs: dict = {
            "region_name": region,
            "config": BotoConfig(
                retries={"max_attempts": 3, "mode": "adaptive"}
            ),
        }
        if aws_key and aws_secret:
            kwargs["aws_access_key_id"] = aws_key
            kwargs["aws_secret_access_key"] = aws_secret

        self._dynamo = boto3.resource("dynamodb", **kwargs)
        self._table = self._dynamo.Table(table_name)
        self._table_name = table_name
        self._ensure_table(region, kwargs)
        logger.info("DynamoDBStore initialised — table=%s region=%s", table_name, region)

    # ── helpers ──────────────────────────────────────────────────────────

    def _ensure_table(self, region: str, kwargs: dict) -> None:
        """Create the table + seed row if it doesn't exist yet."""
        import botocore.exceptions

        try:
            self._table.load()
        except botocore.exceptions.ClientError as exc:
            if exc.response["Error"]["Code"] == "ResourceNotFoundException":
                logger.warning("Table %s not found — creating…", self._table_name)
                import boto3
                client = boto3.client("dynamodb", **{
                    k: v for k, v in kwargs.items() if k != "config"
                })
                client.create_table(
                    TableName=self._table_name,
                    KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
                    AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}],
                    BillingMode="PAY_PER_REQUEST",
                )
                self._table.wait_until_exists()
                self._table.put_item(Item={"pk": "current", "team1": 0, "team2": 0})
                logger.info("Table %s created and seeded", self._table_name)
            else:
                raise

    def _sync_get(self) -> dict:
        resp = self._table.get_item(Key={"pk": "current"})
        item = resp.get("Item", {})
        return {"team1": int(item.get("team1", 0)), "team2": int(item.get("team2", 0))}

    def _sync_increment(self, team: str) -> dict:
        from boto3.dynamodb.conditions import Key  # noqa: F811

        resp = self._table.update_item(
            Key={"pk": "current"},
            UpdateExpression=f"ADD {team} :inc",
            ExpressionAttributeValues={":inc": 1},
            ReturnValues="ALL_NEW",
        )
        attrs = resp["Attributes"]
        return {"team1": int(attrs.get("team1", 0)), "team2": int(attrs.get("team2", 0))}

    def _sync_reset(self) -> dict:
        self._table.put_item(Item={"pk": "current", "team1": 0, "team2": 0})
        return {"team1": 0, "team2": 0}

    # ── async wrappers (run blocking boto3 in threadpool) ────────────────

    async def get_scores(self) -> dict:
        return await asyncio.to_thread(self._sync_get)

    async def increment(self, team: str) -> dict:
        if team not in ("team1", "team2"):
            raise ValueError(f"Invalid team: {team}")
        return await asyncio.to_thread(self._sync_increment, team)

    async def reset(self) -> dict:
        return await asyncio.to_thread(self._sync_reset)


# ── Factory ──────────────────────────────────────────────────────────────────

_store: ScoreStore | None = None


def get_store() -> ScoreStore:
    """Return the singleton ScoreStore based on config."""
    global _store
    if _store is not None:
        return _store

    from config import settings

    if settings.DB_MODE == "dynamodb":
        try:
            _store = DynamoDBStore(
                table_name=settings.DYNAMODB_TABLE_NAME,
                region=settings.AWS_REGION,
                aws_key=settings.AWS_ACCESS_KEY_ID,
                aws_secret=settings.AWS_SECRET_ACCESS_KEY,
            )
        except Exception:
            logger.exception(
                "Failed to connect to DynamoDB — falling back to LocalStore"
            )
            _store = LocalStore()
    else:
        _store = LocalStore()

    return _store
