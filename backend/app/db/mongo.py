from __future__ import annotations

from contextlib import suppress
from typing import Optional
import logging

from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import PyMongoError

from app.core.config import get_settings

logger = logging.getLogger("recapit.db.mongo")

_client: Optional[MongoClient] = None


def connect_to_mongo() -> MongoClient:
    """Initialise a shared MongoClient and verify connectivity."""
    global _client  # noqa: PLW0603 - module-level cache is intentional

    if _client is not None:
        logger.debug("Reusing existing MongoClient")
        return _client

    settings = get_settings()
    logger.info("Connecting to MongoDB: %s", settings.mongo_uri)
    client = MongoClient(settings.mongo_uri)
    try:
        client.admin.command("ping")
    except PyMongoError as exc:  # pragma: no cover - network failure surface
        client.close()
        logger.exception("Unable to connect to MongoDB")
        raise RuntimeError("Unable to connect to MongoDB") from exc

    _client = client
    logger.info("Connected to MongoDB, using database '%s'", settings.mongo_db_name)
    return client


def get_mongo_client() -> MongoClient:
    """Return the cached MongoClient instance, creating it if needed."""
    return connect_to_mongo()


def get_database() -> Database:
    """Resolve the configured Mongo database handle."""
    settings = get_settings()
    client = get_mongo_client()
    return client[settings.mongo_db_name]


def close_mongo_connection() -> None:
    """Dispose of the cached MongoClient so the event loop can shut down cleanly."""
    global _client  # noqa: PLW0603 - module-level cache is intentional

    if _client is None:
        return

    logger.info("Closing MongoDB connection")
    with suppress(Exception):
        _client.close()

    _client = None
